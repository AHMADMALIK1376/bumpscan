import path from "node:path";
import { snapshotApi } from "./core/api-snapshot.js";
import { compareApi, type ApiChange } from "./core/compare-api.js";
import { findCurrentVersion } from "./core/current-version.js";
import { fetchPackage, resolveVersion, type FetchedPackage } from "./core/fetch-package.js";
import { locateTypes } from "./core/locate-types.js";
import { comparePackages } from "./core/package-changes.js";
import { parseTarget } from "./core/parse-target.js";
import { findUsages, loadSourceFiles, type Usage } from "./core/scan-code.js";

export { parseTarget } from "./core/parse-target.js";
export { findCurrentVersion } from "./core/current-version.js";
export { fetchPackage, resolveVersion } from "./core/fetch-package.js";
export { locateTypes } from "./core/locate-types.js";
export { snapshotApi, snapshotSource, type ApiSnapshot, type ApiEntry } from "./core/api-snapshot.js";
export { compareApi, formatSignature, type ApiChange, type Severity } from "./core/compare-api.js";
export { comparePackageJson, allowsRequire } from "./core/package-changes.js";
export { findUsages, loadSourceFiles, type Usage } from "./core/scan-code.js";

export interface PackageSide extends FetchedPackage {
  /** Main `.d.ts` file, if the package ships types. */
  types: string | undefined;
}

export interface UpgradePlan {
  from: PackageSide;
  to: PackageSide;
}

export interface UpgradeReport extends UpgradePlan {
  /** Every difference found, most dangerous first. */
  changes: ApiChange[];
  /** Set when a version ships no types, so only package.json could be compared. */
  typesMissingIn?: string;
}

/** A change together with the places in the project that use it. */
export interface Hit {
  change: ApiChange;
  usages: Usage[];
}

export interface ScanResult extends UpgradeReport {
  /** Changes your code actually touches, most dangerous first. */
  hits: Hit[];
  /** Changes nothing in your code touches. */
  unusedChanges: ApiChange[];
  filesScanned: number;
}

/** Step 1: work out the old and new versions and download both. */
export async function prepareUpgrade(input: string, cwd: string): Promise<UpgradePlan> {
  const target = parseTarget(input);

  const current = await findCurrentVersion(cwd, target.name);
  if (!current) {
    throw new Error(
      `"${target.name}" is not in ${path.join(cwd, "package.json")}. Run bumpscan inside the project that uses it.`,
    );
  }

  const [fromVersion, toVersion] = await Promise.all([
    current.source === "node_modules" ? current.version : resolveVersion(target.name, current.version),
    resolveVersion(target.name, target.range),
  ]);

  const [from, to] = await Promise.all([
    fetchPackage(target.name, fromVersion),
    fetchPackage(target.name, toVersion),
  ]);

  const [fromTypes, toTypes] = await Promise.all([locateTypes(from.dir), locateTypes(to.dir)]);
  return { from: { ...from, types: fromTypes }, to: { ...to, types: toTypes } };
}

/** Step 2: compare package.json and the public API of the two versions. */
export async function compareUpgrade(plan: UpgradePlan): Promise<UpgradeReport> {
  if (plan.from.version === plan.to.version) return { ...plan, changes: [] };

  const packageChanges = await comparePackages(plan.from.dir, plan.to.dir);
  if (!plan.from.types || !plan.to.types) {
    const typesMissingIn = !plan.from.types ? plan.from.version : plan.to.version;
    return { ...plan, changes: packageChanges, typesMissingIn };
  }

  const apiChanges = compareApi(snapshotApi(plan.from.types), snapshotApi(plan.to.types));
  return { ...plan, changes: [...packageChanges, ...apiChanges] };
}

/** Step 3: keep only the changes this project actually uses, with file and line numbers. */
export function scanProject(report: UpgradeReport, cwd: string): ScanResult {
  const snapshot = report.from.types ? snapshotApi(report.from.types) : new Map();
  const files = loadSourceFiles(cwd);
  const usages = findUsages(files, report.from.name, snapshot);

  const byPath = new Map<string, Usage[]>();
  for (const usage of usages) {
    byPath.set(usage.path, [...(byPath.get(usage.path) ?? []), usage]);
  }

  const hits: Hit[] = [];
  const unusedChanges: ApiChange[] = [];
  for (const change of report.changes) {
    // `(package)` changes (ESM-only, Node version) affect the whole project, not one line.
    const used = change.path === "(package)" ? [] : (byPath.get(change.path) ?? []);
    if (used.length || change.path === "(package)") hits.push({ change, usages: used });
    else unusedChanges.push(change);
  }

  return { ...report, hits, unusedChanges, filesScanned: files.length };
}
