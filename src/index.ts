import path from "node:path";
import { snapshotApi } from "./core/api-snapshot.js";
import { compareApi, type ApiChange } from "./core/compare-api.js";
import { findCurrentVersion } from "./core/current-version.js";
import {
  fetchDependencies,
  fetchPackage,
  fetchTypesPackage,
  resolveVersion,
  type FetchedPackage,
} from "./core/fetch-package.js";
import { hasUnresolvedImports, locateTypes } from "./core/locate-types.js";
import { inParallel, listDependencies } from "./core/dependencies.js";
import { comparePackages } from "./core/package-changes.js";
import { parseTarget } from "./core/parse-target.js";
import { findUsages, loadSourceFiles, type Usage } from "./core/scan-code.js";

export { parseTarget } from "./core/parse-target.js";
export { findCurrentVersion } from "./core/current-version.js";
export { fetchPackage, fetchTypesPackage, resolveVersion, typesPackageName } from "./core/fetch-package.js";
export { locateTypes, hasUnresolvedImports } from "./core/locate-types.js";
export { snapshotApi, snapshotSource, type ApiSnapshot, type ApiEntry } from "./core/api-snapshot.js";
export { compareApi, formatSignature, type ApiChange, type Severity } from "./core/compare-api.js";
export { fetchDependencies } from "./core/fetch-package.js";
export { comparePackageJson, allowsRequire } from "./core/package-changes.js";
export { findUsages, loadSourceFiles, type Usage } from "./core/scan-code.js";
export { listDependencies, inParallel, type Dependency } from "./core/dependencies.js";

export interface PackageSide extends FetchedPackage {
  /** Main `.d.ts` file, if types were found. */
  types: string | undefined;
  /** Set when the types came from a separate `@types/…` package. */
  typesPackage?: string;
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

export interface UpgradeVersions {
  name: string;
  fromVersion: string;
  toVersion: string;
}

/** Works out which two versions to compare, without downloading anything. */
export async function resolveUpgrade(input: string, cwd: string): Promise<UpgradeVersions> {
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

  return { name: target.name, fromVersion, toVersion };
}

/** Step 1: work out the old and new versions and download both. */
export async function prepareUpgrade(input: string, cwd: string): Promise<UpgradePlan> {
  const { name, fromVersion, toVersion } = await resolveUpgrade(input, cwd);

  const [from, to] = await Promise.all([fetchPackage(name, fromVersion), fetchPackage(name, toVersion)]);

  const [fromSide, toSide] = await Promise.all([withTypes(from), withTypes(to)]);
  return { from: fromSide, to: toSide };
}

/** Finds a package's types, falling back to its `@types/…` package. */
async function withTypes(pkg: FetchedPackage): Promise<PackageSide> {
  const own = await locateTypes(pkg.dir);
  if (own) return { ...pkg, types: await completeTypes(pkg, own) };

  const types = await fetchTypesPackage(pkg.name, pkg.version);
  if (!types) return { ...pkg, types: undefined };

  const entry = await locateTypes(types.dir);
  return {
    ...pkg,
    types: entry ? await completeTypes(types, entry) : undefined,
    typesPackage: `${types.name}@${types.version}`,
  };
}

/**
 * Types that import from other packages only show their full API once those packages are
 * on disk. Downloading them is slow, so it only happens when an import really is missing.
 */
async function completeTypes(pkg: FetchedPackage, entry: string): Promise<string> {
  if (hasUnresolvedImports(entry)) await fetchDependencies(pkg);
  return entry;
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

/**
 * Step 3: keep only the changes this project actually uses, with file and line numbers.
 * Pass `files` when scanning several packages, so the project is parsed only once.
 */
export function scanProject(report: UpgradeReport, cwd: string, files = loadSourceFiles(cwd)): ScanResult {
  const snapshot = report.from.types ? snapshotApi(report.from.types) : new Map();
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

/** One dependency's outcome in a whole-project scan. */
export interface DependencyResult {
  name: string;
  dev: boolean;
  from?: string;
  to?: string;
  breaking: number;
  risky: number;
  /** Set when this dependency could not be checked. */
  error?: string;
  result?: ScanResult;
}

export interface ProjectScan {
  results: DependencyResult[];
  filesScanned: number;
}

/** Checks every dependency in the project against its latest version. */
export async function scanAllDependencies(
  cwd: string,
  options: { includeDev?: boolean; concurrency?: number; onDone?: (result: DependencyResult) => void } = {},
): Promise<ProjectScan> {
  const dependencies = (await listDependencies(cwd)).filter((d) => options.includeDev !== false || !d.dev);
  const files = loadSourceFiles(cwd);

  const results = await inParallel(dependencies, options.concurrency ?? 4, async (dependency) => {
    let outcome: DependencyResult;
    try {
      // Checking the versions first means an up-to-date package is never downloaded.
      const versions = await resolveUpgrade(`${dependency.name}@latest`, cwd);
      if (versions.fromVersion === versions.toVersion) {
        const upToDate = {
          name: dependency.name,
          dev: dependency.dev,
          from: versions.fromVersion,
          to: versions.toVersion,
          breaking: 0,
          risky: 0,
        };
        options.onDone?.(upToDate);
        return upToDate;
      }

      const plan = await prepareUpgrade(`${dependency.name}@latest`, cwd);
      const report = await compareUpgrade(plan);
      const result = scanProject(report, cwd, files);
      outcome = {
        name: dependency.name,
        dev: dependency.dev,
        from: plan.from.version,
        to: plan.to.version,
        breaking: result.hits.filter((h) => h.change.severity === "breaking").length,
        risky: result.hits.filter((h) => h.change.severity === "maybe").length,
        result,
      };
    } catch (error) {
      outcome = {
        name: dependency.name,
        dev: dependency.dev,
        breaking: 0,
        risky: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    options.onDone?.(outcome);
    return outcome;
  });

  return { results, filesScanned: files.length };
}
