/**
 * export-reference-pdfs.js
 *
 * Exports the approved Oraya A4 print reference guides to PDF.
 *
 * Source files (the approved reference design):
 *   oraya-guest-welcome-guide-print-byblos.html
 *   oraya-guest-welcome-guide-print-mechmech.html
 *
 * RENDERING STRATEGY — screen mode, not print mode:
 *   We do NOT call emulateMediaType('print') because the print CSS
 *   reflows layout and changes font physical sizes relative to the screen
 *   preview. Instead we render in screen mode and inject CSS that:
 *     - hides the review bar and prototype notice
 *     - strips body background / padding
 *     - adds page breaks between .print-page elements
 *   Then export with scale ≈ 1.28 so the 620px screen width fills 210mm
 *   A4 width, and each 877px screen page fills 297mm A4 height exactly.
 *
 *   Result: PDF looks identical to the HTML browser preview.
 *
 * Concept images (assets/concept/*.png) don't exist on disk — this
 * script patches them to Unsplash equivalents before rendering.
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
───────────────────────────────────────────────────────────────── */
const CONCEPT_IMAGE_MAP = {
  'byblos-exterior':    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&h=400&fit=crop&crop=center',
  'mechmech-exterior':  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200&h=400&fit=crop&crop=center',
  'mechmech-pool':      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&h=320&fit=crop&crop=center',
  'mechmech-03-garden': 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=700&h=280&fit=crop&crop=center',
  'mechmech-02':        'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=240&h=200&fit=crop&crop=center',
  'mechmech-04':        'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=240&h=180&fit=crop&crop=center',
  'mechmech-06':        'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=240&h=180&fit=crop&crop=center',
  // Page 4 — Using the Villa
  'villa-kitchen':      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=100&fit=crop&crop=center',
  'villa-bbq':          'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=100&fit=crop&crop=center',
};

/* ─────────────────────────────────────────────────────────────────
   SCALE FACTOR
   Screen page: 620px wide × 877px tall (A4 ratio at 75 CSS DPI).
   A4 at 96 CSS DPI: 793.7px wide × 1122px tall.
   Scale = 793.7 / 620 ≈ 1.28
   → 620px × 1.28 = 793.6px = 210mm (fills A4 width)
   → 877px × 1.28 = 1122.6px = 297mm (fills A4 height)
   The PDF will look exactly like the browser preview.
───────────────────────────────────────────────────────────────── */
const PDF_SCALE = 793.7 / 620; // ≈ 1.2802

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
  console.log('Oraya Print Guide — Reference PDF Export (screen-mode)');
  console.log('─'.repeat(55));
  console.log('Scale: ' + PDF_SCALE.toFixed(4) + '  (620px → 210mm A4 width)');
  console.log('');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--allow-file-access-from-files',
      '--disable-web-security',
    ],
  });

  try {
    for (const guide of GUIDES) {
      console.log(guide.label);
      console.log('  Source : ' + path.relative(process.cwd(), guide.html));
      console.log('  Output : ' + path.relative(process.cwd(), guide.pdf));

      const page = await browser.newPage();

      // Set viewport to exactly 620px — matches .print-page max-width.
      // No centering margin needed; content fills the viewport width.
      await page.setViewport({ width: 620, height: 877 });

      // Load in screen mode (no emulateMediaType)
      const fileUrl = pathToFileURL(guide.html).href;
      await page.goto(fileUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Wait for Playfair Display + Lato
      await page.evaluate(() => document.fonts.ready);

      // ── Patch concept image src values to Unsplash equivalents ──────────
      await page.evaluate((imageMap) => {
        document.querySelectorAll('.concept-img').forEach(img => {
          var src = img.getAttribute('src') || '';
          var stem = src.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
          if (imageMap[stem]) {
            img.setAttribute('src', imageMap[stem]);
            img.removeAttribute('srcset');
            img.style.objectFit = 'cover';
          }
        });
      }, CONCEPT_IMAGE_MAP);

      // Wait for patched images (up to 12 s)
      await page.evaluate(() => new Promise(function(resolve) {
        var imgs = Array.from(document.querySelectorAll('.concept-img'));
        var pending = imgs.filter(function(i) { return !i.complete; }).length;
        if (pending === 0) { resolve(); return; }
        var done = function() { if (--pending === 0) resolve(); };
        imgs.forEach(function(img) {
          if (!img.complete) { img.onload = img.onerror = done; }
        });
        setTimeout(resolve, 12000);
      }));

      // ── Inject screen-mode PDF CSS from oraya-print-export.css ─────────────
      // Edit oraya-print-export.css to patch PDF vs HTML discrepancies.
      await page.addStyleTag({ path: path.join(GUIDE_DIR, 'oraya-print-export.css') });

      // ── FORCE SCREEN MEDIA ─────────────────────────────────────────────────
      // CRITICAL: page.pdf() applies @media print rules BY DEFAULT, even if you
      // never call emulateMediaType('print'). The only way to keep the accepted
      // 620px screen layout is to explicitly emulate 'screen' here. Without this,
      // the @media print block in oraya-print-a4.css takes over and renders each
      // page as a fixed 620px box on the A4 sheet (only ~68% width filled).
      await page.emulateMediaType('screen');

      // ── Generate PDF ──────────────────────────────────────────────────────
      // scale ≈ 1.28: maps the 620px screen layout to 210mm A4 width,
      // and each 877px page to exactly 297mm A4 height. The whole accepted
      // design is enlarged uniformly to fill the sheet — proportions unchanged.
      const pdfBuffer = await page.pdf({
        format:               'A4',
        scale:                PDF_SCALE,
        printBackground:      true,
        displayHeaderFooter:  false,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });

      // ── Write — survive EBUSY ─────────────────────────────────────────────
      let savedPath = guide.pdf;
      try {
        fs.writeFileSync(guide.pdf, pdfBuffer);
      } catch (writeErr) {
        if (writeErr.code === 'EBUSY') {
          var tmpPath = guide.pdf.replace(/\.pdf$/i, '.tmp' + Date.now() + '.pdf');
          fs.writeFileSync(tmpPath, pdfBuffer);
          try {
            try { fs.renameSync(guide.pdf, guide.pdf + '.old'); } catch (_) {}
            fs.renameSync(tmpPath, guide.pdf);
            try { fs.unlinkSync(guide.pdf + '.old'); } catch (_) {}
          } catch (_) {
            savedPath = tmpPath;
            console.warn('  Warning: PDF locked — saved as: ' + path.basename(tmpPath));
          }
        } else {
          throw writeErr;
        }
      }

      var sizeKB = Math.round(fs.statSync(savedPath).size / 1024);
      console.log('  Status : OK — ' + sizeKB + ' KB');
      console.log('');

      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log('─'.repeat(55));
  console.log('Done. PDFs saved to:');
  console.log('  ' + EXPORTS_DIR);
})().catch(function(err) {
  console.error('\nExport failed:', err.message);
  process.exit(1);
});
