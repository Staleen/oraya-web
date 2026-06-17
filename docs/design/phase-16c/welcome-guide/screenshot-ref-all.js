const puppeteer = require('puppeteer');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const DIR = __dirname;
const OUT = path.join(DIR, 'exports');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--allow-file-access-from-files','--disable-web-security'] });
  const pg = await browser.newPage();
  await pg.setViewport({ width: 900, height: 1200 });

  for (var villa of ['byblos', 'mechmech']) {
    await pg.goto(pathToFileURL(path.join(DIR, 'oraya-guest-welcome-guide-print-' + villa + '.html')).href, { waitUntil: 'networkidle2', timeout: 60000 });
    await pg.evaluate(function() { return document.fonts.ready; });
    // PRODUCTION: load the real on-disk villa images (no Unsplash patching).
    await new Promise(function(r) { setTimeout(r, 3000); });

    for (var i = 1; i <= 7; i++) {
      var id = 'print-p' + i;
      var el = await pg.$('#' + id);
      if (!el) { console.log('MISSING: ' + villa + ' ' + id); continue; }
      var box = await el.boundingBox();
      var outPath = path.join(OUT, 'ref-' + villa + '-p' + i + '.png');
      await pg.screenshot({ path: outPath, clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
      var flag = (box.height > 880) ? ' *** OVERFLOW ***' : '';
      console.log(villa + ' p' + i + ': ' + Math.round(box.width) + 'x' + Math.round(box.height) + 'px' + flag);
    }
    console.log('');
  }

  await browser.close();
  console.log('Done — screenshots in: ' + OUT);
})().catch(function(e) { console.error(e.message); process.exit(1); });
