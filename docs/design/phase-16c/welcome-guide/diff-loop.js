/**
 * diff-loop.js
 *
 * Visual PDF vs HTML comparison loop for Oraya Principal Welcome Guides.
 *
 * WORKFLOW
 *   1. Export PDFs  — Puppeteer renders the HTML (screen mode) to A4 PDF
 *                     using oraya-print-export.css as the print CSS layer.
 *   2. Screenshot HTML pages  — Puppeteer clips each .print-page element
 *                     at 2× device-pixel-ratio → 1240×1754 px per page.
 *   3. Screenshot PDF pages   — pdftoppm converts each PDF page to PNG
 *                     at 150 DPI → 1240×1754 px (A4 at 150 DPI).
 *   4. Side-by-side diff      — ImageMagick stitches HTML | PDF for each
 *                     page pair and adds a labelled header row.
 *   5. Report       — Logs any size mismatches; prints a summary.
 *
 * PATCH CYCLE
 *   After reviewing exports/diff/{variant}-diff-pN.png:
 *     1. Edit oraya-print-export.css (sections 5–7 are the patch areas).
 *     2. Re-run:  node docs/design/phase-16c/welcome-guide/diff-loop.js
 *     3. Review updated diff images. Repeat until pages match.
 *
 * OUTPUTS
 *   exports/diff/byblos-html-pN.png   — HTML screen reference (page N)
 *   exports/diff/byblos-pdf-pN.png    — PDF render (page N)
 *   exports/diff/byblos-diff-pN.png   — Side-by-side comparison
 *   (same set for mechmech)
 *   exports/diff/byblos-diff-all.png  — Full guide stacked comparison
 *   exports/diff/mechmech-diff-all.png
 *
 * RUN
 *   node docs/design/phase-16c/welcome-guide/diff-loop.js
 *   node docs/design/phase-16c/welcome-guide/diff-loop.js --skip-export
 *   node docs/design/phase-16c/welcome-guide/diff-loop.js --variant byblos
 */

'use strict';

const puppeteer         = require('puppeteer');
const path              = require('path');
const fs                = require('fs');
const { execSync }      = require('child_process');
const { pathToFileURL } = require('url');

/* ─────────────────────────────────────────────────────────────────
   CLI FLAGS
───────────────────────────────────────────────────────────────── */
const ARGS        = process.argv.slice(2);
const SKIP_EXPORT = ARGS.includes('--skip-export');
const ONLY        = ARGS.includes('--variant')
  ? ARGS[ARGS.indexOf('--variant') + 1]
  : null;   // 'byblos' | 'mechmech' | null (both)

/* ─────────────────────────────────────────────────────────────────
   PATHS
───────────────────────────────────────────────────────────────── */
const GUIDE_DIR   = __dirname;
const EXPORTS_DIR = path.join(GUIDE_DIR, 'exports');
const DIFF_DIR    = path.join(EXPORTS_DIR, 'diff');

[EXPORTS_DIR, DIFF_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

/* ─────────────────────────────────────────────────────────────────
   SCALE
   620px screen width × 1.2802 = 793.6px = 210mm A4 width
   877px screen height × 1.2802 = 1122.6px = 297mm A4 height
───────────────────────────────────────────────────────────────── */
const PDF_SCALE = 793.7 / 620;   // ≈ 1.2802

/* 150 DPI on A4: 210/25.4*150=1240, 297/25.4*150=1754 */
const PDF_DPI   = 150;
const PAGE_IDS  = ['p1','p2','p3','p4','p5','p6','p7'];

/* ─────────────────────────────────────────────────────────────────
   CONCEPT IMAGE MAP  (local asset stem → Unsplash URL)
───────────────────────────────────────────────────────────────── */
const CONCEPT_IMAGE_MAP = {
  'byblos-exterior':    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&h=400&fit=crop&crop=center',
  'mechmech-exterior':  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200&h=400&fit=crop&crop=center',
  'mechmech-pool':      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&h=320&fit=crop&crop=center',
  'mechmech-03-garden': 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=700&h=280&fit=crop&crop=center',
  'mechmech-02':        'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=240&h=200&fit=crop&crop=center',
  'mechmech-04':        'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=240&h=180&fit=crop&crop=center',
  'mechmech-06':        'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=240&h=180&fit=crop&crop=center',
  'villa-kitchen':      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=100&fit=crop&crop=center',
  'villa-bbq':          'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=100&fit=crop&crop=center',
};

/* ─────────────────────────────────────────────────────────────────
   GUIDE DEFINITIONS
───────────────────────────────────────────────────────────────── */
const ALL_GUIDES = [
  {
    variant:  'byblos',
    label:    'Villa Byblos',
    html:     path.join(GUIDE_DIR, 'oraya-guest-welcome-guide-print-byblos.html'),
    pdf:      path.join(EXPORTS_DIR, 'oraya-guide-print-byblos.pdf'),
  },
  {
    variant:  'mechmech',
    label:    'Villa Mechmech',
    html:     path.join(GUIDE_DIR, 'oraya-guest-welcome-guide-print-mechmech.html'),
    pdf:      path.join(EXPORTS_DIR, 'oraya-guide-print-mechmech.pdf'),
  },
];

const GUIDES = ONLY
  ? ALL_GUIDES.filter(g => g.variant === ONLY)
  : ALL_GUIDES;

/* ─────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────── */

/** Check a command exists in PATH */
function checkCmd(cmd) {
  try { execSync(`which ${cmd}`, { stdio: 'ignore' }); return true; }
  catch (_) { return false; }
}

/** Write PDF buffer, survive EBUSY (file locked in PDF viewer) */
function writePdf(destPath, buffer) {
  try {
    fs.writeFileSync(destPath, buffer);
    return destPath;
  } catch (e) {
    if (e.code !== 'EBUSY') throw e;
    const tmp = destPath.replace(/\.pdf$/i, `.tmp${Date.now()}.pdf`);
    fs.writeFileSync(tmp, buffer);
    try {
      try { fs.renameSync(destPath, destPath + '.old'); } catch (_) {}
      fs.renameSync(tmp, destPath);
      try { fs.unlinkSync(destPath + '.old'); } catch (_) {}
      return destPath;
    } catch (_) {
      console.warn(`  Warning: PDF locked — saved temp copy: ${path.basename(tmp)}`);
      return tmp;
    }
  }
}

/** Pad a number to two digits */
function pad2(n) { return String(n).padStart(2, '0'); }

/* ─────────────────────────────────────────────────────────────────
   STEP 1 — EXPORT PDFs  (Puppeteer, screen mode + print export CSS)
───────────────────────────────────────────────────────────────── */
async function exportPdfs(browser) {
  console.log('\n── Step 1 · Export PDFs ─────────────────────────────');

  for (const guide of GUIDES) {
    console.log(`\n  ${guide.label}`);
    const page = await browser.newPage();
    await page.setViewport({ width: 620, height: 877 });

    const fileUrl = pathToFileURL(guide.html).href;
    await page.goto(fileUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);

    // Patch concept images to Unsplash URLs
    await page.evaluate((map) => {
      document.querySelectorAll('.concept-img').forEach(img => {
        var stem = (img.getAttribute('src') || '')
          .replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
        if (map[stem]) {
          img.setAttribute('src', map[stem]);
          img.removeAttribute('srcset');
          img.style.objectFit = 'cover';
        }
      });
    }, CONCEPT_IMAGE_MAP);

    // Wait for patched images
    await page.evaluate(() => new Promise(resolve => {
      const imgs = Array.from(document.querySelectorAll('.concept-img'));
      const pending = imgs.filter(i => !i.complete);
      if (!pending.length) { resolve(); return; }
      let n = pending.length;
      pending.forEach(i => { i.onload = i.onerror = () => { if (!--n) resolve(); }; });
      setTimeout(resolve, 12000);
    }));

    // Inject oraya-print-export.css
    await page.addStyleTag({ path: path.join(GUIDE_DIR, 'oraya-print-export.css') });

    const pdfBuffer = await page.pdf({
      format:              'A4',
      scale:               PDF_SCALE,
      printBackground:     true,
      displayHeaderFooter: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    const saved = writePdf(guide.pdf, pdfBuffer);
    const kb    = Math.round(fs.statSync(saved).size / 1024);
    console.log(`  PDF    : ${path.basename(saved)}  (${kb} KB)`);

    await page.close();
  }
}

/* ─────────────────────────────────────────────────────────────────
   STEP 2 — SCREENSHOT HTML PAGES  (2× DPR → 1240×1754 per page)
───────────────────────────────────────────────────────────────── */
async function screenshotHtml(browser) {
  console.log('\n── Step 2 · Screenshot HTML pages ──────────────────');

  const results = {};

  for (const guide of GUIDES) {
    console.log(`\n  ${guide.label}`);
    results[guide.variant] = [];

    const page = await browser.newPage();
    // 2× device-pixel-ratio: 620×877 logical → 1240×1754 physical
    await page.setViewport({ width: 620, height: 877, deviceScaleFactor: 2 });

    const fileUrl = pathToFileURL(guide.html).href;
    await page.goto(fileUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);

    // Patch concept images (same as PDF export — keeps screenshots consistent)
    await page.evaluate((map) => {
      document.querySelectorAll('.concept-img').forEach(img => {
        var stem = (img.getAttribute('src') || '')
          .replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
        if (map[stem]) {
          img.setAttribute('src', map[stem]);
          img.removeAttribute('srcset');
          img.style.objectFit = 'cover';
        }
      });
    }, CONCEPT_IMAGE_MAP);

    await page.evaluate(() => new Promise(resolve => {
      const imgs = Array.from(document.querySelectorAll('.concept-img'));
      const pending = imgs.filter(i => !i.complete);
      if (!pending.length) { resolve(); return; }
      let n = pending.length;
      pending.forEach(i => { i.onload = i.onerror = () => { if (!--n) resolve(); }; });
      setTimeout(resolve, 12000);
    }));

    for (let i = 0; i < PAGE_IDS.length; i++) {
      const id     = PAGE_IDS[i];
      const pageN  = i + 1;
      const outFile = path.join(DIFF_DIR, `${guide.variant}-html-p${pageN}.png`);

      const el = await page.$(`#print-${id}`);
      if (!el) {
        console.warn(`  Missing element: #print-${id} in ${guide.variant}`);
        results[guide.variant].push(null);
        continue;
      }

      const box = await el.boundingBox();
      await page.screenshot({
        path: outFile,
        clip: {
          x:      box.x,
          y:      box.y,
          width:  box.width,
          height: box.height,
          // At 2× DPR the PNG is 1240×1754 for a 620×877 element
        },
      });

      results[guide.variant].push(outFile);
      console.log(`  HTML p${pageN} : ${path.basename(outFile)}`);
    }

    await page.close();
  }

  return results;
}

/* ─────────────────────────────────────────────────────────────────
   STEP 3 — SCREENSHOT PDF PAGES  (pdftoppm → 150 DPI PNGs)
   150 DPI on A4 = 1240×1754 px — matches the HTML screenshots.
───────────────────────────────────────────────────────────────── */
function screenshotPdfs() {
  console.log('\n── Step 3 · Screenshot PDF pages (pdftoppm) ────────');

  const results = {};

  for (const guide of GUIDES) {
    console.log(`\n  ${guide.label}`);
    results[guide.variant] = [];

    if (!fs.existsSync(guide.pdf)) {
      console.error(`  PDF not found: ${guide.pdf}`);
      results[guide.variant] = PAGE_IDS.map(() => null);
      continue;
    }

    const prefix = path.join(DIFF_DIR, `${guide.variant}-pdf-p`);

    try {
      execSync(
        `pdftoppm -r ${PDF_DPI} -png -cropbox "${guide.pdf}" "${prefix}"`,
        { stdio: 'pipe' },
      );
    } catch (e) {
      console.error(`  pdftoppm failed: ${e.message}`);
      results[guide.variant] = PAGE_IDS.map(() => null);
      continue;
    }

    // pdftoppm names files prefix-01.png, prefix-02.png, …
    for (let i = 0; i < PAGE_IDS.length; i++) {
      const pageN   = i + 1;
      const padded  = pad2(pageN);
      const outFile = `${prefix}-${padded}.png`;

      if (fs.existsSync(outFile)) {
        results[guide.variant].push(outFile);
        console.log(`  PDF  p${pageN} : ${path.basename(outFile)}`);
      } else {
        console.warn(`  PDF  p${pageN} : NOT FOUND (${path.basename(outFile)})`);
        results[guide.variant].push(null);
      }
    }
  }

  return results;
}

/* ─────────────────────────────────────────────────────────────────
   STEP 4 — BUILD SIDE-BY-SIDE DIFF IMAGES  (ImageMagick)
   Left = HTML reference, Right = PDF output.
   Label bar at top: "HTML  ←  Page N  →  PDF"
───────────────────────────────────────────────────────────────── */
function buildDiffs(htmlScreenshots, pdfScreenshots) {
  console.log('\n── Step 4 · Build diff images ───────────────────────');

  if (!checkCmd('convert')) {
    console.warn('  ImageMagick not found — skipping diff images.');
    return;
  }

  for (const guide of GUIDES) {
    const v     = guide.variant;
    const htmlS = htmlScreenshots[v] || [];
    const pdfS  = pdfScreenshots[v] || [];
    const diffFiles = [];

    for (let i = 0; i < PAGE_IDS.length; i++) {
      const pageN   = i + 1;
      const htmlFile = htmlS[i];
      const pdfFile  = pdfS[i];
      const diffFile = path.join(DIFF_DIR, `${v}-diff-p${pageN}.png`);

      if (!htmlFile || !pdfFile) {
        console.warn(`  ${v} p${pageN} : skipped (missing source)`);
        continue;
      }

      // Both images are 1240×1754. Side-by-side = 2480×1754 + 10px gap + 60px header.
      try {
        execSync([
          'convert',
          // Label bar
          `\\( -size 2490x60`,
          `   xc:"#1F2B38"`,
          `   -fill "#C5A46D" -font DejaVu-Sans-Bold -pointsize 20`,
          `   -gravity West  -annotate +20+0 "HTML (reference)"`,
          `   -gravity Center -annotate +0+0  "Page ${pageN} of 7"`,
          `   -gravity East  -annotate -20+0 "PDF (output)"`,
          `\\)`,
          // HTML image
          `\\( "${htmlFile}" -resize 1240x1754! \\)`,
          // 10px separator
          `\\( -size 10x1754 xc:"#C5A46D" \\)`,
          // PDF image
          `\\( "${pdfFile}" -resize 1240x1754! \\)`,
          // Stack: label on top, then images side by side
          `\\( -clone 1,2,3 +append \\)`,
          `-delete 1,2,3`,
          `-append`,
          `"${diffFile}"`,
        ].join(' '), { stdio: 'pipe' });

        console.log(`  ${v} p${pageN} : ${path.basename(diffFile)}`);
        diffFiles.push(diffFile);
      } catch (e) {
        console.error(`  ${v} p${pageN} : convert failed — ${e.stderr ? e.stderr.toString().slice(0,120) : e.message}`);
      }
    }

    // Stacked "all pages" comparison for the variant
    if (diffFiles.length > 0) {
      const allFile = path.join(DIFF_DIR, `${v}-diff-all.png`);
      try {
        execSync(
          `convert ${diffFiles.map(f => `"${f}"`).join(' ')} -append "${allFile}"`,
          { stdio: 'pipe' },
        );
        const kb = Math.round(fs.statSync(allFile).size / 1024);
        console.log(`  ${v} ALL : ${path.basename(allFile)}  (${kb} KB)`);
      } catch (e) {
        console.error(`  ${v} ALL : append failed — ${e.message}`);
      }
    }
  }
}

/* ─────────────────────────────────────────────────────────────────
   MAIN
───────────────────────────────────────────────────────────────── */
(async () => {
  const t0 = Date.now();

  console.log('');
  console.log('Oraya Welcome Guide — Visual Diff Loop');
  console.log('═'.repeat(50));
  if (ONLY)        console.log(`Variant   : ${ONLY}`);
  if (SKIP_EXPORT) console.log('Mode      : skip-export (reuse existing PDFs)');
  console.log(`Print CSS : oraya-print-export.css`);
  console.log(`Diff dir  : exports/diff/`);

  // Pre-flight checks
  if (!checkCmd('pdftoppm')) {
    console.error('\nERROR: pdftoppm not found. Install poppler-utils and retry.');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--allow-file-access-from-files',
      '--disable-web-security',
    ],
  });

  try {
    if (!SKIP_EXPORT) {
      await exportPdfs(browser);
    } else {
      console.log('\n── Step 1 · Skipped (--skip-export) ────────────────');
    }

    const htmlScreenshots = await screenshotHtml(browser);
    const pdfScreenshots  = screenshotPdfs();
    buildDiffs(htmlScreenshots, pdfScreenshots);

  } finally {
    await browser.close();
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(50));
  console.log(`Done in ${elapsed}s`);
  console.log('');
  console.log('Review diff images in:');
  console.log(`  ${DIFF_DIR}`);
  console.log('');
  console.log('To patch: edit oraya-print-export.css (sections 5–7),');
  console.log('then re-run:');
  console.log('  node docs/design/phase-16c/welcome-guide/diff-loop.js');
  console.log('');
})().catch(err => {
  console.error('\nDiff loop failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
