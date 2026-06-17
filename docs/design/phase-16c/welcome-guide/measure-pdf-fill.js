/**
 * measure-pdf-fill.js
 * Renders each PDF page to a clean canvas via pdf.js (no viewer chrome)
 * and measures the bounding box of non-white content vs the page edges.
 * This is the ground-truth test for "does the content fill the A4 sheet".
 */
'use strict';

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const DIR = __dirname;
const OUT = path.join(DIR, 'exports');

const PDFS = [
  { file: path.join(OUT, 'oraya-guide-print-byblos.pdf'),   name: 'byblos' },
  { file: path.join(OUT, 'oraya-guide-print-mechmech.pdf'), name: 'mechmech' },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  page.on('console', m => { /* silence */ });

  const html = `<!DOCTYPE html><html><head>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    </head><body><canvas id="c"></canvas></body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle0' });

  // confirm pdf.js loaded
  const ok = await page.evaluate(() => typeof window.pdfjsLib !== 'undefined');
  if (!ok) { console.error('pdf.js failed to load from CDN'); process.exit(1); }
  await page.evaluate(() => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  });

  for (const pdf of PDFS) {
    if (!fs.existsSync(pdf.file)) { console.log('MISSING ' + pdf.file); continue; }
    const b64 = fs.readFileSync(pdf.file).toString('base64');

    console.log('\n================  ' + pdf.name.toUpperCase() + '  ================');
    console.log('page |  pageW x pageH (px@96) | contentL  contentR | L-marg  R-marg | width-fill%');
    console.log('-----+------------------------+-------------------+---------------+-----------');

    const total = await page.evaluate(async (data) => {
      const raw = atob(data);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      window.__doc = await window.pdfjsLib.getDocument({ data: arr }).promise;
      return window.__doc.numPages;
    }, b64);

    for (let p = 1; p <= total; p++) {
      const r = await page.evaluate(async (pnum) => {
        const pg = await window.__doc.getPage(pnum);
        // scale 96dpi: PDF points (72dpi) * 96/72
        const vp = pg.getViewport({ scale: 96 / 72 });
        const canvas = document.getElementById('c');
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await pg.render({ canvasContext: ctx, viewport: vp }).promise;

        const W = canvas.width, H = canvas.height;
        const img = ctx.getImageData(0, 0, W, H).data;
        // treat pixel as "content" if it differs from white by > threshold
        const TH = 12;
        let minX = W, maxX = -1, minY = H, maxY = -1;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const rr = img[i], gg = img[i + 1], bb = img[i + 2];
            if ((255 - rr) > TH || (255 - gg) > TH || (255 - bb) > TH) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        return { W, H, minX, maxX, minY, maxY };
      }, p);

      const contentW = r.maxX - r.minX + 1;
      const fill = ((contentW / r.W) * 100).toFixed(1);
      const rMarg = r.W - 1 - r.maxX;
      const line =
        ' p' + p + '  | ' +
        String(r.W).padStart(4) + ' x ' + String(r.H).padStart(4) + ' px        | ' +
        String(r.minX).padStart(4) + '     ' + String(r.maxX).padStart(4) + '   | ' +
        String(r.minX).padStart(4) + '    ' + String(rMarg).padStart(4) + '    | ' +
        fill + '%';
      console.log(line);
    }
  }

  await browser.close();
  console.log('\nDone.');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
