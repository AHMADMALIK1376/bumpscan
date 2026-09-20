/**
 * Builds docs/demo.svg: an animated terminal replay for the README.
 *
 * The lines below are the real output of `npx bumpscan express@5` run against a small
 * express 4 project. Re-run the command and paste the result here to refresh the demo.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const COMMAND = "npx bumpscan express@5";

const OUTPUT = [
  ["", ""],
  ["head", "bumpscan  express  4.22.3 -> 5.2.1"],
  ["dim", "   types from @types/express@4.17.25 -> @types/express@5.0.6"],
  ["", ""],
  ["red-bold", "Breaks your code (3)"],
  ["red", "  ✗ your whole project  now needs Node 18.0.0 or newer"],
  ["green", "       fix: check that your CI and servers run Node 18 or newer"],
  ["red", "  ✗ Request.param  method was removed"],
  ["cyan", "       src/server.ts:8:14  const id = req.param(\"id\");"],
  ["red", "  ✗ Response.sendfile  method was removed"],
  ["green", "       fix: maybe use sendFile"],
  ["cyan", "       src/server.ts:9:3  res.sendfile(`/data/${id}.json`);"],
  ["", ""],
  ["yellow-bold", "Might break your code (1)"],
  ["yellow", "  ! Express.listen  parameter or return types changed"],
  ["cyan", "       src/server.ts:12:1  app.listen(3000, () => ...);"],
  ["", ""],
  ["dim", "3 breaking, 1 risky in 1 of your files"],
  ["dim", "13 other changes don't touch your code · 1 file scanned"],
];

const COLORS = {
  "": "#c9d1d9",
  head: "#f0f6fc",
  dim: "#8b949e",
  red: "#ff7b72",
  "red-bold": "#ff7b72",
  green: "#7ee787",
  yellow: "#e3b341",
  "yellow-bold": "#e3b341",
  cyan: "#79c0ff",
};

const LINE_HEIGHT = 19;
const TOP = 58;
const LEFT = 18;
const CHAR_DELAY = 0.045;
const LINE_DELAY = 0.11;
const HOLD = 3.4;

const typingTime = COMMAND.length * CHAR_DELAY;
const outputTime = OUTPUT.length * LINE_DELAY;
const TOTAL = typingTime + outputTime + HOLD;
const height = TOP + (OUTPUT.length + 2) * LINE_HEIGHT + 20;
const width = 760;

/** A line is hidden, appears at `at` seconds, then hides again before the loop restarts. */
function fadeIn(at) {
  const start = ((at / TOTAL) * 100).toFixed(3);
  const end = (((TOTAL - 0.25) / TOTAL) * 100).toFixed(3);
  return `0%,${start}%{opacity:0}${start}%,${end}%{opacity:1}${end}%,100%{opacity:0}`;
}

const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const keyframes = [];
const body = [];

// The command, one character at a time.
COMMAND.split("").forEach((character, index) => {
  const name = `t${index}`;
  keyframes.push(`@keyframes ${name}{${fadeIn(index * CHAR_DELAY)}}`);
  body.push(
    `<tspan class="${name}" xml:space="preserve">${escape(character)}</tspan>`,
  );
});

const lines = OUTPUT.map(([kind, text], index) => {
  const name = `l${index}`;
  keyframes.push(`@keyframes ${name}{${fadeIn(typingTime + 0.35 + index * LINE_DELAY)}}`);
  const weight = kind.endsWith("bold") ? ' font-weight="600"' : "";
  return `<text x="${LEFT}" y="${TOP + (index + 1) * LINE_HEIGHT}" fill="${COLORS[kind]}"${weight} class="${name}" xml:space="preserve">${escape(text)}</text>`;
});

const styles = [
  ...COMMAND.split("").map((_, index) => `.t${index}{opacity:0;animation:t${index} ${TOTAL}s steps(1) infinite}`),
  ...OUTPUT.map((_, index) => `.l${index}{opacity:0;animation:l${index} ${TOTAL}s steps(1) infinite}`),
  `.cursor{animation:blink 1s steps(1) infinite}`,
  `@keyframes blink{0%,50%{opacity:1}50%,100%{opacity:0}}`,
  ...keyframes,
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13">
  <style>${styles.join("")}</style>
  <rect width="${width}" height="${height}" rx="10" fill="#0d1117" stroke="#30363d"/>
  <circle cx="22" cy="22" r="6" fill="#ff5f56"/>
  <circle cx="42" cy="22" r="6" fill="#ffbd2e"/>
  <circle cx="62" cy="22" r="6" fill="#27c93f"/>
  <text x="${width / 2}" y="26" fill="#8b949e" font-size="12" text-anchor="middle">bumpscan</text>
  <text x="${LEFT}" y="${TOP}" xml:space="preserve"><tspan fill="#7ee787">$ </tspan><tspan fill="#f0f6fc">${body.join("")}</tspan><tspan fill="#f0f6fc" class="cursor">█</tspan></text>
  ${lines.join("\n  ")}
</svg>
`;

const out = path.join(process.cwd(), "docs", "demo.svg");
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, svg);
console.log(`wrote ${out} (${(svg.length / 1024).toFixed(1)} kB, ${TOTAL.toFixed(1)}s loop)`);
