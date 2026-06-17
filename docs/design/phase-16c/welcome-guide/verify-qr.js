/**
 * verify-qr.js — decodes the generated QR SVGs to confirm they actually
 * resolve to the correct Maps URLs (production scannability check).
 */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const DIR = __dirname;
const CASES = [
  { svg: path.join(DIR, 'assets', 'qr-byblos.svg'),   expect: 'https://maps.app.goo.gl/1a1Ybf4o6Qyzy7xh7' },
  { svg: path.join(DIR, 'assets', 'qr-mechmech.svg'), expect: 'https://maps.app.goo.gl/2A4jAeUKWP8G9GbVA' },
];

(async () => {
  const browser = await puppeteer.launch({ headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const html = `<!DOCTYPE html><html><head>
    <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
    </head><body><canvas id="c"></canvas></body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const ok = await page.evaluate(() => typeof window.jsQR !== 'undefined');
  if (!ok) { console.error('jsQR failed to load'); process.exit(1); }

  let allPass = true;
  for (const c of CASES) {
    const svg = fs.readFileSync(c.svg, 'utf8');
    const decoded = await page.evaluate(async (svgStr) => {
      const SIZE = 600;
      const blob = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = blob; });
      const c = document.getElementById('c');
      c.width = SIZE; c.height = SIZE;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const data = ctx.getImageData(0, 0, SIZE, SIZE);
      const r = window.jsQR(data.data, SIZE, SIZE);
      return r ? r.data : null;
    }, svg);

    const pass = decoded === c.expect;
    allPass = allPass && pass;
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + path.basename(c.svg));
    console.log('   expected: ' + c.expect);
    console.log('   decoded : ' + (decoded || '(no QR detected)'));
  }
  await browser.close();
  console.log(allPass ? '\nAll QR codes scan correctly.' : '\nQR MISMATCH — fix required.');
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
