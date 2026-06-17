/**
 * screenshot-pdfs.js
 * Screenshots each page of the exported PDFs using Puppeteer.
 * Uses #page=N fragment to navigate Chromium's built-in PDF viewer.
 */
'use strict';

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const DIR = __dirname;
const OUT = path.join(DIR, 'exports');

const TOTAL_PAGES = 7;

// A4 at 96dpi
const PAGE_W = 794;
const PAGE_H = 1123;

const PDFS = [
  {
    file: path.join(OUT, 'oraya-guide-print-byblos.pdf'),
    name: 'byblos',
  },
  {
    file: path.join(OUT, 'oraya-guide-print-mechmech.pdf'),
    name: 'mechmech',
  },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--allow-file-access-from-files',
      '--disable-web-security',
    ],
  });

  for (const pdf of PDFS) {
    if (!fs.existsSync(pdf.file)) {
      console.log('MISSING: ' + pdf.file);
      continue;
    }

    const baseUrl = pathToFileURL(pdf.file).href;
    console.log('\n' + pdf.name.toUpperCase());

    for (var i = 1; i <= TOTAL_PAGES; i++) {
      var page = await browser.newPage();
      await page.setViewport({ width: PAGE_W, height: PAGE_H });

      // Navigate to specific page with fragment
      var pageUrl = baseUrl + '#page=' + i;
      await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 20000 });
      await new Promise(r => setTimeout(r, 2500));

      var outPath = path.join(OUT, 'pdf-' + pdf.name + '-p' + i + '.png');
      await page.screenshot({ path: outPath });
      console.log('  p' + i + ' → ' + path.basename(outPath));

      await page.close();
    }
  }

  await browser.close();
  console.log('\nDone — PDF screenshots saved.');
})().catch(function(e) { console.error(e.message); process.exit(1); });
