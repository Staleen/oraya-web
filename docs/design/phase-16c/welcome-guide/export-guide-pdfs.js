/**
 * export-guide-pdfs.js
 *
 * Generates static A4 home book PDFs for both Oraya villas.
 *
 * Source: oraya-home-book-byblos.html / oraya-home-book-mechmech.html
 *   — pure A4 print templates (210mm × 297mm, 14mm padding).
 *   — No CSS injection or emulateMediaType required.
 *   — Screen view and PDF output use the same physical-unit layout.
 *
 * Output:
 *   exports/oraya-home-book-byblos.pdf
 *   exports/oraya-home-book-mechmech.pdf
 *
 * Run from project root:
 *   node docs/design/phase-16c/welcome-guide/export-guide-pdfs.js
 */

'use strict';

const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');
const { pathToFileURL } = require('url');

const GUIDE_DIR   = __dirname;
const EXPORTS_DIR = path.join(GUIDE_DIR, 'exports');

if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

const GUIDES = [
  {
    html:  path.join(GUIDE_DIR, 'oraya-home-book-byblos.html'),
    pdf:   path.join(EXPORTS_DIR, 'oraya-home-book-byblos.pdf'),
    label: 'Villa Byblos',
  },
  {
    html:  path.join(GUIDE_DIR, 'oraya-home-book-mechmech.html'),
    pdf:   path.join(EXPORTS_DIR, 'oraya-home-book-mechmech.pdf'),
    label: 'Villa Mechmech',
  },
];

(async () => {
  console.log('Oraya Home Book — PDF Export');
  console.log('─'.repeat(44));

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--allow-file-access-from-files',
    ],
  });

  try {
    for (const guide of GUIDES) {
      console.log(`\n${guide.label}`);
      console.log(`  Source : ${path.relative(process.cwd(), guide.html)}`);
      console.log(`  Output : ${path.relative(process.cwd(), guide.pdf)}`);

      const page = await browser.newPage();

      // Viewport wider than 210mm (793.7px) so the page card renders naturally
      await page.setViewport({ width: 1080, height: 800 });

      // Load the print template. networkidle2 tolerates slow Google Fonts + Unsplash images.
      const fileUrl = pathToFileURL(guide.html).href;
      await page.goto(fileUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Wait for fonts (Playfair Display + Lato via Google Fonts CDN)
      await page.evaluate(() => document.fonts.ready);

      // Switch to print media type so all @media print CSS rules are applied.
      // Without this, Puppeteer renders in screen mode even during page.pdf(),
      // causing body padding / page margins to persist and producing 60+ pages
      // instead of the correct 7 A4 pages.
      await page.emulateMediaType('print');

      // Inject a safety override — ensures margin:0 even if @media print is
      // applied late, and re-confirms page-break rules.
      await page.addStyleTag({ content: [
        'html,body{margin:0!important;padding:0!important;background:transparent!important;}',
        '.hb-page{margin:0 auto!important;box-shadow:none!important;',
        'break-after:page;page-break-after:always;}',
        '.hb-page:last-of-type{break-after:auto;page-break-after:auto;}',
      ].join('') });

      // Write via buffer to survive EBUSY (file open in a PDF viewer / OneDrive lock).
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });

      let savedPath = guide.pdf;
      try {
        fs.writeFileSync(guide.pdf, pdfBuffer);
      } catch (writeErr) {
        if (writeErr.code === 'EBUSY') {
          // File is locked (open in viewer or OneDrive sync). Write to a temp file
          // then atomically rename over the original.
          const tmpPath = guide.pdf.replace(/\.pdf$/i, `.tmp${Date.now()}.pdf`);
          fs.writeFileSync(tmpPath, pdfBuffer);
          const oldPath = guide.pdf + '.old';
          try {
            // Move the locked file out of the way, then rename the new one in.
            try { fs.renameSync(guide.pdf, oldPath); } catch (_) { /* already gone */ }
            fs.renameSync(tmpPath, guide.pdf);
            try { fs.unlinkSync(oldPath); } catch (_) { /* best-effort cleanup */ }
          } catch (renameErr) {
            // Could not rename — leave the temp file and report its path.
            savedPath = tmpPath;
            console.warn(`  Warning: could not overwrite locked PDF. Saved as: ${path.basename(tmpPath)}`);
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
