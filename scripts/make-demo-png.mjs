/**
 * Renders docs/demo.svg to docs/demo.png, for places that cannot display SVG (X, Reddit).
 * Uses a Chrome or Edge already installed on the machine, so there is nothing to download.
 *
 *   node scripts/make-demo-png.mjs
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((candidate) => typeof candidate === "string");

const browser = CANDIDATES.find((candidate) => existsSync(candidate));
if (!browser) {
  console.error("No Chrome or Edge found. Set CHROME_PATH to one and run this again.");
  process.exit(1);
}

const svgPath = path.join(process.cwd(), "docs", "demo.svg");
const pngPath = path.join(process.cwd(), "docs", "demo.png");
const svg = await readFile(svgPath, "utf8");
const width = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 760);
const height = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 480);

// The animation hides each line until its turn, so it is frozen at the end to show everything.
const page = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#0d1117}*{animation-play-state:paused!important;animation-delay:-5.5s!important}</style>
${svg}`;

const dir = await mkdtemp(path.join(os.tmpdir(), "bumpscan-png-"));
const htmlPath = path.join(dir, "demo.html");
await writeFile(htmlPath, page);

await run(browser, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=2",
  `--window-size=${width},${height}`,
  `--screenshot=${pngPath}`,
  `file://${htmlPath.replaceAll("\\", "/")}`,
]);

console.log(`wrote ${pngPath} using ${path.basename(browser)}`);
