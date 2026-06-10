const puppeteer = require('puppeteer');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const DIR = __dirname;
const OUT = path.join(DIR, 'exports');

const CONCEPT_IMAGE_MAP = {
  'byblos-exterior':    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&h=400&fit=crop',
  'mechmech-exterior':  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200&h=400&fit=crop',
  'mechmech-pool':      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&h=320&fit=crop',
  'mechmech-03-garden': 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=700&h=280&fit=crop',
  'mechmech-02':        'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=240&h=200&fit=crop',
  'mechmech-04':        'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=240&h=180&fit=crop',
  'mechmech-06':        'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=240&h=180&fit=crop',
};

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--allow-file-access-from-files','--disable-web-security'] });
  const pg = await browser.newPage();
  await pg.setViewport({ width: 900, height: 1200 });

  for (const villa of ['byblos', 'mechmech']) {
    await pg.goto(pathToFileURL(path.join(DIR, 'oraya-guest-welcome-guide-print-' + villa + '.html')).href, { waitUntil: 'networkidle2', timeout: 60000 });
    await pg.evaluate(function() { return document.fonts.ready; });
    await pg.evaluate(function(m) {
      document.querySelectorAll('.concept-img').forEach(function(img) {
        var stem = (img.getAttribute('src') || '').replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '');
        if (m[stem]) img.setAttribute('src', m[stem]);
      });
    }, CONCEPT_IMAGE_MAP);
    await new Promise(function(r) { setTimeout(r, 4000); });

    for (var i = 1; i <= 3; i++) {
      var id = 'print-p' + i;
      var el = await pg.$('#' + id);
      if (!el) { console.log('MISSING: ' + villa + ' ' + id); continue; }
      var box = await el.boundingBox();
      var outPath = path.join(OUT, 'ref-' + villa + '-p' + i + '.png');
      await pg.screenshot({ path: outPath, clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
      console.log('OK: ' + villa + ' page ' + i + ' (' + Math.round(box.width) + 'x' + Math.round(box.height) + 'px)');
    }
  }

  await browser.close();
  console.log('Screenshots saved to: ' + OUT);
})().catch(function(e) { console.error(e.message); process.exit(1); });
