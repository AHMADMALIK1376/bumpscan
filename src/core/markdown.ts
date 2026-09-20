import path from "node:path";
import type { Hit, ScanResult } from "../index.js";

/** Hidden marker so the Action updates its own comment instead of adding new ones. */
export const MARKER = "<!-- bumpscan -->";

/**
 * Pulls the upgrade out of a bot's pull request title, e.g.
 * "chore(deps): bump axios from 0.27.2 to 1.20.0" → `axios@1.20.0`.
 */
export function titleToTarget(title: string): string | undefined {
  return titleToUpgrade(title)?.target;
}

export interface TitleUpgrade {
  /** `axios@1.20.0`, ready to pass to the scanner. */
  target: string;
  /**
   * The version being replaced, when the title names it. On an upgrade pull request the
   * checked-out package.json already holds the new version, so without this the scan would
   * compare a version against itself.
   */
  from?: string;
}

export function titleToUpgrade(title: string): TitleUpgrade | undefined {
  const bump = /(?:bump|update|upgrade)\s+(\S+)\s+from\s+v?(\S+)\s+to\s+v?(\S+)/i.exec(title);
  if (bump) return { target: `${bump[1]}@${bump[3]}`, from: bump[2] };

  // Renovate style: "Update dependency axios to v1.20.0"
  const renovate = /update\s+dependency\s+(\S+)\s+to\s+v?(\S+)/i.exec(title);
  return renovate ? { target: `${renovate[1]}@${renovate[2]}` } : undefined;
}

/** At most five places, written relative to the project. */
function link(hit: Hit, cwd: string): string {
  return hit.usages
    .slice(0, 5)
    .map((usage) => {
      const relative = path.relative(cwd, usage.file).replaceAll("\\", "/");
      const file = relative.startsWith("..") ? usage.file.split(/[\\/]/).slice(-2).join("/") : relative;
      return `\`${file}:${usage.line}\``;
    })
    .join(", ");
}

function rows(hits: Hit[], cwd: string): string {
  return hits
    .map((hit) => {
      const what = hit.change.path === "(package)" ? "whole project" : `\`${hit.change.path}\``;
      const fix = hit.change.fix ? ` ${hit.change.fix}` : "";
      return `| ${what} | ${hit.change.message}${fix ? ` —${fix}` : ""} | ${link(hit, cwd) || "—"} |`;
    })
    .join("\n");
}

/** The pull request comment. */
export function markdownReport(result: ScanResult, cwd: string = process.cwd()): string {
  const breaking = result.hits.filter((h) => h.change.severity === "breaking");
  const risky = result.hits.filter((h) => h.change.severity === "maybe");
  const title = `### 🧨 bumpscan · \`${result.to.name}\` ${result.from.version} → ${result.to.version}`;

  if (!breaking.length && !risky.length) {
    return [
      MARKER,
      title,
      "",
      `✅ Nothing in this project uses anything that changed. ${result.changes.length} API changes, none of them yours.`,
    ].join("\n");
  }

  const parts = [MARKER, title, ""];

  if (breaking.length) {
    parts.push(`#### ❌ Breaks your code (${breaking.length})`, "", "| What | Change | Where |", "| --- | --- | --- |", rows(breaking, cwd), "");
  }
  if (risky.length) {
    parts.push(
      `<details><summary>⚠️ Might break your code (${risky.length})</summary>`,
      "",
      "| What | Change | Where |",
      "| --- | --- | --- |",
      rows(risky, cwd),
      "",
      "</details>",
      "",
    );
  }

  parts.push(
    `<sub>${result.unusedChanges.length} other changes don't touch your code · ${result.filesScanned} files scanned · [bumpscan](https://github.com/AHMADMALIK1376/bumpscan)</sub>`,
  );
  return parts.join("\n");
}
