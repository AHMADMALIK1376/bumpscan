import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProjectScan, ScanResult } from "./report.js";

const run = promisify(execFile);

export type Runner = "npx" | "global";

/** npx on Windows is a .cmd file, which needs the shell to start it. */
function command(runner: Runner): { file: string; prefix: string[] } {
  const windows = process.platform === "win32";
  if (runner === "global") return { file: windows ? "bumpscan.cmd" : "bumpscan", prefix: [] };
  return { file: windows ? "npx.cmd" : "npx", prefix: ["--yes", "bumpscan@latest"] };
}

/** Runs bumpscan and parses its JSON. Anything printed before the JSON is ignored. */
async function json<T>(args: string[], cwd: string, runner: Runner): Promise<T> {
  const { file, prefix } = command(runner);
  const { stdout } = await run(file, [...prefix, ...args, "--json"], {
    cwd,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });

  const start = stdout.indexOf("{");
  if (start === -1) throw new Error(`bumpscan printed no result:\n${stdout.slice(0, 400)}`);
  return JSON.parse(stdout.slice(start)) as T;
}

/** One upgrade, e.g. `express@5`. */
export function scanOne(target: string, cwd: string, runner: Runner): Promise<ScanResult> {
  return json<ScanResult>([target], cwd, runner);
}

/** Every dependency against its latest version. */
export function scanAll(cwd: string, runner: Runner): Promise<ProjectScan> {
  return json<ProjectScan>([], cwd, runner);
}
