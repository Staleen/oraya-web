import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WATCH_FILE = path.join(ROOT, "app", "page.tsx");
const OUT_DIR = path.join(ROOT, "public", "screenshots");

const SHOTS = [
  { file: "01-hero.png",       scroll: 0    },
  { file: "02-intro.png",      scroll: 900  },
  { file: "03-villas.png",     scroll: 1800 },
  { file: "04-experience.png", scroll: 2500 },
  { file: "05-membership.png", scroll: 3200 },
  { file: "06-footer.png",     scroll: 3800 },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

let debounceTimer = null;

async function takeScreenshots() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://localhost:3000", { waitUntil: "networkidle2", timeout: 30000 });

    for (const { file, scroll } of SHOTS) {
      await page.evaluate((y) => window.scrollTo(0, y), scroll);
      await new Promise((r) => setTimeout(r, 400));
      await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: false });
    }

    console.log("Screenshots updated →", OUT_DIR);
  } finally {
    await browser.close();
  }
}

function scheduleScreenshots() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    console.log("Change detected — waiting for Next.js recompile…");
    await new Promise((r) => setTimeout(r, 3000));
    try {
      await takeScreenshots();
    } catch (err) {
      console.error("Screenshot error:", err.message);
    }
  }, 200);
}

console.log("Watching", WATCH_FILE);
fs.watch(WATCH_FILE, scheduleScreenshots);

// Take an initial screenshot on startup
takeScreenshots().catch((err) => console.error("Initial screenshot error:", err.message));
