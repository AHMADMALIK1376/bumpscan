import path from "node:path";
import { findCurrentVersion } from "./core/current-version.js";
import { fetchPackage, resolveVersion, type FetchedPackage } from "./core/fetch-package.js";
import { locateTypes } from "./core/locate-types.js";
import { parseTarget } from "./core/parse-target.js";

export { parseTarget } from "./core/parse-target.js";
export { findCurrentVersion } from "./core/current-version.js";
export { fetchPackage, resolveVersion } from "./core/fetch-package.js";
export { locateTypes } from "./core/locate-types.js";

export interface PackageSide extends FetchedPackage {
  /** Main `.d.ts` file, if the package ships types. */
  types: string | undefined;
}

export interface UpgradePlan {
  from: PackageSide;
  to: PackageSide;
}

/**
 * Step 1 of a scan: work out the old and new versions and download both.
 * Comparing their types (step 2) and scanning the user's code (step 3) come next.
 */
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
