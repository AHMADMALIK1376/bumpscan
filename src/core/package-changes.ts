import { readFile } from "node:fs/promises";
import path from "node:path";
import semver from "semver";
import type { ApiChange } from "./compare-api.js";

type PackageJson = Record<string, any>;

async function readPackageJson(dir: string): Promise<PackageJson> {
  return JSON.parse((await readFile(path.join(dir, "package.json"), "utf8")).replace(/^﻿/, ""));
}

/** Whether a target in `exports` (a path, a list, or a conditions object) can be loaded with `require()`. */
function targetAllowsRequire(target: unknown, type: string | undefined): boolean {
  if (typeof target === "string") {
    if (target.endsWith(".cjs")) return true;
    if (target.endsWith(".mjs")) return false;
    return type !== "module";
  }
  if (Array.isArray(target)) return target.some((t) => targetAllowsRequire(t, type));
  if (target && typeof target === "object") {
    const conditions = target as Record<string, unknown>;
    if ("require" in conditions) return true;
    if ("node" in conditions) return targetAllowsRequire(conditions.node, type);
    if ("default" in conditions) return targetAllowsRequire(conditions.default, type);
  }
  return false;
}

export function allowsRequire(pkg: PackageJson): boolean {
  const { exports: exp, type } = pkg;
  if (exp === undefined) return targetAllowsRequire(pkg.main ?? "index.js", type);
  const root = exp && typeof exp === "object" && !Array.isArray(exp) && "." in exp ? exp["."] : exp;
  return targetAllowsRequire(root, type);
}

/** Changes that live in package.json rather than in the types: module format and Node version. */
export function comparePackageJson(before: PackageJson, after: PackageJson): ApiChange[] {
  const changes: ApiChange[] = [];

  if (allowsRequire(before) && !allowsRequire(after)) {
    changes.push({
      path: "(package)",
      kind: "changed",
      severity: "breaking",
      message: "is now ESM-only: require() stops working. Use import, or Node 22+ which can require() ESM",
    });
  }

  const minNode = (pkg: PackageJson) => {
    const range = pkg.engines?.node;
    return typeof range === "string" && semver.validRange(range) ? semver.minVersion(range) : null;
  };
  const oldNode = minNode(before);
  const newNode = minNode(after);
  if (newNode && (!oldNode || semver.gt(newNode, oldNode))) {
    changes.push({
      path: "(package)",
      kind: "changed",
      severity: "breaking",
      message: `now needs Node ${newNode.version} or newer${oldNode ? ` (was ${oldNode.version})` : ""}`,
    });
  }

  return changes;
}

export async function comparePackages(beforeDir: string, afterDir: string): Promise<ApiChange[]> {
  const [before, after] = await Promise.all([readPackageJson(beforeDir), readPackageJson(afterDir)]);
  return comparePackageJson(before, after);
}
