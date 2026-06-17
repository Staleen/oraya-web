/**
 * render-pdf-clean.js
 * Renders PDF pages to clean full-page PNGs via pdf.js (no viewer chrome),
 * so the exported result can be inspected exactly as it sits on the A4 sheet.
 */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const DIR = __dirname;
const OUT = path.join(DIR, 'exports');
const TARGETS = [
  { file: path.join(OUT, 'oraya-guide-print-byblos.pdf'),   name: 'byblos',   pages: [1, 2, 3, 5, 7] },
  { file: path.join(OUT, 'oraya-guide-print-mechmech.pdf'), name: 'mechmech', pages: [1] },
];

(async () => {
  const browser = await puppeteer.launch({ headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  const html = `<!DOCTYPE html><html><head>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <style>body{margin:0;background:#888;} canvas{display:block;box-shadow:0 0 0 1px #000;}</style>
    </head><body><canvas id="c"></canvas></body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; });

  for (const t of TARGETS) {
    const b64 = fs.readFileSync(t.file).toString('base64');
    await page.evaluate(async (data) => {
      const raw = atob(data); const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      window.__doc = await window.pdfjsLib.getDocument({ data: arr }).promise;
    }, b64);
    for (const p of t.pages) {
      await page.evaluate(async (pnum) => {
        const pg = await window.__doc.getPage(pnum);
        const vp = pg.getViewport({ scale: 96 / 72 });
        const c = document.getElementById('c');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      }, p);
      const el = await page.$('#c');
      const outPath = path.join(OUT, 'clean-' + t.name + '-p' + p + '.png');
      await el.screenshot({ path: outPath });
      console.log('  ' + path.basename(outPath));
    }
  }
  await browser.close();
  console.log('Done.');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
