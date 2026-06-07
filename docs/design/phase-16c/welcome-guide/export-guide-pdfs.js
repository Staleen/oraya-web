/**
 * export-guide-pdfs.js
 *
 * Generates static A4 home book PDFs for both Oraya villas.
 *
 * Output:
 *   exports/oraya-home-book-byblos.pdf
 *   exports/oraya-home-book-mechmech.pdf
 *
 * Run from project root:
 *   node docs/design/phase-16c/welcome-guide/export-guide-pdfs.js
 *
 * Or from within the welcome-guide directory:
 *   node export-guide-pdfs.js
 *
 * Requirements: Puppeteer (already in node_modules at project root).
 *   Run this script from the project root so require('puppeteer') resolves.
 */

'use strict';

const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');
const { pathToFileURL } = require('url');

// ── Paths ──────────────────────────────────────────────────────────────────────
const GUIDE_DIR  = __dirname;
const EXPORTS_DIR = path.join(GUIDE_DIR, 'exports');

if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

// ── Villa guide definitions ────────────────────────────────────────────────────
const GUIDES = [
  {
    html:  path.join(GUIDE_DIR, 'oraya-guest-welcome-guide-print-byblos.html'),
    pdf:   path.join(EXPORTS_DIR, 'oraya-home-book-byblos.pdf'),
    label: 'Villa Byblos',
  },
  {
    html:  path.join(GUIDE_DIR, 'oraya-guest-welcome-guide-print-mechmech.html'),
    pdf:   path.join(EXPORTS_DIR, 'oraya-home-book-mechmech.pdf'),
    label: 'Villa Mechmech',
  },
];

// ── A4 CSS injected at export time ─────────────────────────────────────────────
//
// The browser HTML files use a 620px-wide screen layout (approved visual).
// The existing @media print centres that 620px content on A4, leaving ~23mm
// white margins on each side.
//
// For physical book production we want content to fill A4 (210mm × 297mm,
// 14mm padding). This CSS is injected ONLY inside the Puppeteer headless
// renderer — the browser screen view is completely unchanged.
//
const PDF_CSS = `
  @page { size: A4 portrait; margin: 0; }

  html, body {
    width: 210mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  /* Hide review-only UI */
  .review-bar,
  .prototype-notice {
    display: none !important;
  }

  /* Stretch page stack to A4 width (was: flex-centred at 620px) */
  .print-document {
    width: 210mm !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Full A4 page with 14mm padding */
  .print-page {
    width: 210mm !important;
    height: 297mm !important;
    padding: 14mm !important;
    box-sizing: border-box !important;
    margin: 0 !important;
    box-shadow: none !important;
    border: none !important;
    break-after: page !important;
    page-break-after: always !important;
  }

  .print-page:last-child {
    break-after: auto !important;
    page-break-after: auto !important;
  }

  /* Hero image: bleed to A4 edges (compensate for 14mm padding) */
  .pp-hero {
    margin: -14mm -14mm 0 !important;
    width: 210mm !important;
  }

  /* Page number: push to bottom of flex column */
  .pp-page-number {
    position: static !important;
    margin-top: auto !important;
  }

  /* Suppress browser link URL annotations */
  a::after { content: none !important; }

  /* Placeholder tags: plain italic in print */
  .placeholder-tag {
    background: none !important;
    color: #2E2E2E !important;
    padding: 0 !important;
    font-style: italic !important;
  }

  /* Checkout item checkboxes */
  .pp-checkout-item__box {
    width: 9pt !important;
    height: 9pt !important;
    border: 1pt solid #999 !important;
  }
`;

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Oraya Home Book — PDF Export');
  console.log('─'.repeat(40));

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

      // Set viewport wide enough that screen CSS doesn't unexpectedly trigger
      // mobile breakpoints. 1024px is safely wider than our 620px design.
      await page.setViewport({ width: 1024, height: 768 });

      // Load the HTML file. networkidle2 allows up to 2 open connections
      // (tolerates slow Google Fonts requests without timing out).
      const fileUrl = pathToFileURL(guide.html).href;
      await page.goto(fileUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for all fonts to finish loading (Google Fonts CDN)
      await page.evaluate(() => document.fonts.ready);

      // Switch to @media print so the print CSS block activates
      await page.emulateMediaType('print');

      // Inject A4-filling CSS (overrides the 620px centred print layout)
      await page.addStyleTag({ content: PDF_CSS });

      // Generate A4 PDF with background graphics, no browser chrome
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

  console.log('\n' + '─'.repeat(40));
  console.log('Done. PDFs saved to:');
  console.log(`  ${EXPORTS_DIR}`);
})().catch(err => {
  console.error('\nExport failed:', err.message);
  process.exit(1);
});
