/**
 * export-reference-pdfs.js
 *
 * Exports the approved Oraya A4 print reference guides to PDF.
 *
 * Source files (the approved reference design):
 *   oraya-guest-welcome-guide-print-byblos.html
 *   oraya-guest-welcome-guide-print-mechmech.html
 *
 * These use oraya-print-a4.css which already contains correct @media print
 * rules:  @page { size: A4; margin: 0 }  ·  html { width: 210mm }
 *         .print-page { width: 620px; height: 297mm; break-after: page }
 *
 * Concept images (assets/concept/*.png) don't exist on disk yet — this
 * script patches them to equivalent Unsplash images before rendering so
 * the PDF visually matches the approved HTML preview.
 *
 * Output:
 *   exports/oraya-guide-print-byblos.pdf
 *   exports/oraya-guide-print-mechmech.pdf
 *
 * Run:
 *   node docs/design/phase-16c/welcome-guide/export-reference-pdfs.js
 */

'use strict';

const puppeteer       = require('puppeteer');
const path            = require('path');
const fs              = require('fs');
const { pathToFileURL } = require('url');

const GUIDE_DIR   = __dirname;
const EXPORTS_DIR = path.join(GUIDE_DIR, 'exports');

if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

/* ─────────────────────────────────────────────────────────────────
   CONCEPT IMAGE REPLACEMENTS
   Maps the local asset filename stem to a matching Unsplash image.
   Aspect ratios chosen to match the concept-img-wrap heights in CSS:
     --hero   195px tall, 540px wide  (page-width image)
     --small   82px tall
     --micro   58px tall (thumb strip)
───────────────────────────────────────────────────────────────── */
const CONCEPT_IMAGE_MAP = {
  // Byblos — coastal Mediterranean villa
  'byblos-exterior':    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&h=400&fit=crop&crop=center',

  // Mechmech — mountain villa with pool
  'mechmech-exterior':  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200&h=400&fit=crop&crop=center',
  'mechmech-pool':      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&h=320&fit=crop&crop=center',
  'mechmech-03-garden': 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=700&h=280&fit=crop&crop=center',

  // Hospitality details (used in both guides)
  'mechmech-02':        'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=240&h=200&fit=crop&crop=center',
  'mechmech-04':        'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=240&h=180&fit=crop&crop=center',
  'mechmech-06':        'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=240&h=180&fit=crop&crop=center',
};

const GUIDES = [
  {
    html:  path.join(GUIDE_DIR, 'oraya-guest-welcome-guide-print-byblos.html'),
    pdf:   path.join(EXPORTS_DIR, 'oraya-guide-print-byblos.pdf'),
    label: 'Villa Byblos — Print Guide',
  },
  {
    html:  path.join(GUIDE_DIR, 'oraya-guest-welcome-guide-print-mechmech.html'),
    pdf:   path.join(EXPORTS_DIR, 'oraya-guide-print-mechmech.pdf'),
    label: 'Villa Mechmech — Print Guide',
  },
];

(async () => {
  console.log('Oraya Print Guide — Reference PDF Export');
  console.log('─'.repeat(44));

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--allow-file-access-from-files',
      '--disable-web-security',          // allows file:// page to load external images
    ],
  });

  try {
    for (const guide of GUIDES) {
      console.log(`\n${guide.label}`);
      console.log(`  Source : ${path.relative(process.cwd(), guide.html)}`);
      console.log(`  Output : ${path.relative(process.cwd(), guide.pdf)}`);

      const page = await browser.newPage();

      // Wide viewport so the 620px page cards render naturally in screen mode
      await page.setViewport({ width: 900, height: 1200 });

      // Load the file — networkidle2 waits for Google Fonts CDN
      const fileUrl = pathToFileURL(guide.html).href;
      await page.goto(fileUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Wait for Playfair Display + Lato to finish loading
      await page.evaluate(() => document.fonts.ready);

      // ── Patch concept image src values to Unsplash equivalents ──────────
      // The local assets/concept/*.png files don't exist on disk yet; we
      // replace each broken src with the matching Unsplash URL so the PDF
      // matches the approved visual design.
      await page.evaluate((imageMap) => {
        document.querySelectorAll('.concept-img').forEach(img => {
          const src = img.getAttribute('src') || '';
          // Stem = filename without path or extension
          const stem = src.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
          if (imageMap[stem]) {
            img.setAttribute('src', imageMap[stem]);
            img.removeAttribute('srcset');
            img.style.objectFit = 'cover';
          }
        });
      }, CONCEPT_IMAGE_MAP);

      // Wait for patched images to load (up to 15 s)
      await page.evaluate(() => new Promise(resolve => {
        const imgs = Array.from(document.querySelectorAll('.concept-img'));
        let pending = imgs.filter(i => !i.complete).length;
        if (pending === 0) { resolve(); return; }
        const done = () => { if (--pending === 0) resolve(); };
        imgs.forEach(img => {
          if (!img.complete) { img.onload = img.onerror = done; }
        });
        setTimeout(resolve, 15000);
      }));

      // ── Switch to print media type ────────────────────────────────────────
      // oraya-print-a4.css already defines all necessary @media print rules:
      //   @page { size: A4 portrait; margin: 0 }
      //   html, body { width: 210mm; }
      //   .print-page { width: 620px; height: 297mm; break-after: page; }
      //   .review-bar, .prototype-notice { display: none !important; }
      await page.emulateMediaType('print');

      // ── Safety overrides — reinforce print rules after media switch ────────
      await page.addStyleTag({ content: [
        'html,body{margin:0!important;padding:0!important;background:#fff!important;}',
        '.review-bar,.prototype-notice{display:none!important;}',
        '.print-document{width:210mm;margin:0;padding:0;',
          'display:flex;flex-direction:column;align-items:center;}',
        '.print-page{',
          'width:620px;height:297mm;padding:36px 40px;',
          'box-sizing:border-box;',
          'box-shadow:none!important;border:none!important;margin:0!important;',
          'break-after:page;page-break-after:always;}',
        '.print-page:last-of-type,.print-page:last-child{',
          'break-after:auto;page-break-after:auto;}',
        '.concept-img{width:100%;display:block;object-fit:cover;}',
      ].join('') });

      // ── Generate PDF ──────────────────────────────────────────────────────
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });

      // ── Write — survive EBUSY (PDF open in viewer / OneDrive sync) ────────
      let savedPath = guide.pdf;
      try {
        fs.writeFileSync(guide.pdf, pdfBuffer);
      } catch (writeErr) {
        if (writeErr.code === 'EBUSY') {
          const tmpPath = guide.pdf.replace(/\.pdf$/i, `.tmp${Date.now()}.pdf`);
          fs.writeFileSync(tmpPath, pdfBuffer);
          const oldPath = guide.pdf + '.old';
          try {
            try { fs.renameSync(guide.pdf, oldPath); } catch (_) { /* already gone */ }
            fs.renameSync(tmpPath, guide.pdf);
            try { fs.unlinkSync(oldPath); } catch (_) { /* best-effort cleanup */ }
          } catch (renameErr) {
            savedPath = tmpPath;
            console.warn(`  Warning: PDF locked — saved as: ${path.basename(tmpPath)}`);
          }
        } else {
          throw writeErr;
        }
      }

      const sizeKB = Math.round(fs.statSync(savedPath).size / 1024);
      console.log(`  Status : OK — ${sizeKB} KB`);

      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log('\n' + '─'.repeat(44));
  console.log('Done. PDFs saved to:');
  console.log(`  ${EXPORTS_DIR}`);
})().catch(err => {
  console.error('\nExport failed:', err.message);
  process.exit(1);
});
