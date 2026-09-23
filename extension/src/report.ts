/**
 * Turning bumpscan's JSON into things the editor can show.
 * Nothing here imports `vscode`, so it can be tested on its own.
 */

export interface Usage {
  file: string;
  /** 1-based, as the CLI reports it. */
  line: number;
  /** 1-based. */
  column: number;
  code: string;
}

export interface Change {
  path: string;
  severity: "breaking" | "maybe" | "safe";
  message: string;
  fix?: string;
}

export interface Hit {
  change: Change;
  usages: Usage[];
}

export interface ScanResult {
  from: { name: string; version: string };
  to: { name: string; version: string };
  hits: Hit[];
  unusedChanges: unknown[];
  filesScanned: number;
  typesMissingIn?: string;
}

export interface DependencyResult {
  name: string;
  from?: string;
  to?: string;
  breaking: number;
  risky: number;
  error?: string;
}

export interface ProjectScan {
  results: DependencyResult[];
  filesScanned: number;
}

export interface Problem {
  file: string;
  /** 0-based, ready for the editor. */
  line: number;
  startColumn: number;
  endColumn: number;
  severity: "error" | "warning";
  message: string;
}

/** `Request.param` → `param`, so the name can be found in the line of code. */
export function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf(".") + 1);
}

/**
 * The part of the line to underline. The CLI gives a 1-based column for the start of
 * the expression; the name itself is what people want to see marked.
 */
export function highlight(lineText: string, column: number, name: string): [start: number, end: number] {
  const from = Math.max(0, column - 1);
  const at = lineText.indexOf(name, from);
  if (at !== -1) return [at, at + name.length];

  // The name may sit before the reported column (e.g. a chain), so try the whole line.
  const anywhere = lineText.indexOf(name);
  if (anywhere !== -1) return [anywhere, anywhere + name.length];

  // Nothing matched: underline from the column to the end of the line.
  return [from, Math.max(from + 1, lineText.trimEnd().length)];
}

export function problemMessage(scan: ScanResult, change: Change): string {
  const upgrade = `${scan.to.name} ${scan.from.version} → ${scan.to.version}`;
  const fix = change.fix ? `\nFix: ${change.fix}` : "";
  return `${change.path}: ${change.message} (${upgrade})${fix}`;
}

/** One problem per place in the code, ready to be drawn in the editor. */
export function toProblems(
  scan: ScanResult,
  lineTextOf: (file: string, line: number) => string,
  includeRisky = true,
): Problem[] {
  const problems: Problem[] = [];

  for (const hit of scan.hits) {
    if (hit.change.severity === "safe") continue;
    if (hit.change.severity === "maybe" && !includeRisky) continue;

    for (const usage of hit.usages) {
      const text = lineTextOf(usage.file, usage.line);
      const [startColumn, endColumn] = highlight(text, usage.column, lastSegment(hit.change.path));
      problems.push({
        file: usage.file,
        line: usage.line - 1,
        startColumn,
        endColumn,
        severity: hit.change.severity === "breaking" ? "error" : "warning",
        message: problemMessage(scan, hit.change),
      });
    }
  }
  return problems;
}

/** Changes that affect the whole project, e.g. ESM-only or a newer Node. They belong to no line. */
export function projectWideChanges(scan: ScanResult): Change[] {
  return scan.hits.filter((hit) => hit.change.path === "(package)").map((hit) => hit.change);
}

export function summarise(scan: ScanResult): string {
  const count = (severity: Change["severity"]) => scan.hits.filter((h) => h.change.severity === severity).length;
  const breaking = count("breaking");
  const risky = count("maybe");
  const upgrade = `${scan.to.name} ${scan.from.version} → ${scan.to.version}`;

  if (!breaking && !risky) return `${upgrade}: nothing in your code is affected (${scan.filesScanned} files scanned)`;
  return `${upgrade}: ${breaking} breaking, ${risky} risky in your code`;
}

/** Lines for the "check every dependency" list, worst first. */
export function dependencyItems(scan: ProjectScan): { label: string; detail: string; name: string; to?: string }[] {
  return scan.results
    .filter((result) => result.from !== result.to)
    .sort((a, b) => b.breaking - a.breaking || b.risky - a.risky)
    .map((result) => ({
      name: result.name,
      to: result.to,
      label: `${result.breaking ? "$(error)" : result.risky ? "$(warning)" : "$(check)"} ${result.name}`,
      detail: result.error
        ? `could not check: ${result.error}`
        : `${result.from} → ${result.to}  ·  ${result.breaking} breaking, ${result.risky} risky`,
    }));
}
