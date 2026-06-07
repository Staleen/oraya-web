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

      // Load the print template. networkidle2 tolerates slow Google Fonts.
      const fileUrl = pathToFileURL(guide.html).href;
      await page.goto(fileUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for fonts (Playfair Display + Lato via Google Fonts CDN)
      await page.evaluate(() => document.fonts.ready);

      // The HTML files are pure print templates — no media-type switch needed.
      // @page { size: A4; margin: 0 } and physical-unit page dimensions handle
      // the layout. Each .hb-page (210mm × 297mm) maps to exactly one A4 page.
      await page.pdf({
        path: guide.pdf,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });

      const sizeKB = Math.round(fs.statSync(guide.pdf).size / 1024);
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
