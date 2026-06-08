const puppeteer = require('puppeteer');
const { pathToFileURL } = require('url');
const path = require('path');
const DIR = __dirname;
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--allow-file-access-from-files'] });
  const pg = await browser.newPage();
  await pg.setViewport({ width: 1200, height: 900 });
  for (const pair of [['byblos','oraya-home-book-byblos.html'],['mechmech','oraya-home-book-mechmech.html']]) {
    await pg.goto(pathToFileURL(path.join(DIR, pair[1])).href, { waitUntil: 'networkidle2', timeout: 60000 });
    await pg.evaluate(function(){ return document.fonts.ready; });
    const el = await pg.$('#p1');
    if (!el) { console.log('MISSING: ' + pair[0]); continue; }
    const box = await el.boundingBox();
    await pg.screenshot({ path: path.join(DIR,'exports',pair[0]+'-p1-check.png'), clip: { x:box.x, y:box.y, width:box.width, height:box.height } });
    console.log('OK: ' + pair[0] + '-p1');
  }
  await browser.close();
})().catch(function(e){ console.error(e.message); process.exit(1); });
