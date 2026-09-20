import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pacote from "pacote";

export interface FetchedPackage {
  name: string;
  version: string;
  /** Folder holding the unpacked package. */
  dir: string;
}

const CACHE_ROOT = path.join(os.tmpdir(), "bumpscan");

/** Resolves a version or range to an exact version from the npm registry. */
export async function resolveVersion(name: string, range: string): Promise<string> {
  const manifest = await pacote.manifest(`${name}@${range}`);
  return manifest.version;
}

/** `express` → `@types/express`, `@tanstack/query` → `@types/tanstack__query`. */
export function typesPackageName(name: string): string {
  return name.startsWith("@") ? `@types/${name.slice(1).replace("/", "__")}` : `@types/${name}`;
}

/**
 * Many packages keep their types in a separate `@types/…` package. Those follow the
 * package's major version, so `express@4` pairs with `@types/express@4`.
 */
export async function fetchTypesPackage(name: string, version: string): Promise<FetchedPackage | undefined> {
  const typesName = typesPackageName(name);
  const major = version.split(".")[0] ?? "";

  for (const range of [`^${major}`, "latest"]) {
    try {
      const typesVersion = await resolveVersion(typesName, range);
      return await fetchPackage(typesName, typesVersion);
    } catch {
      // No @types package, or none for that major: try the next option.
    }
  }
  return undefined;
}

/** Downloads and unpacks one exact version. Each version is fetched once, then reused. */
export async function fetchPackage(name: string, version: string): Promise<FetchedPackage> {
  const dir = path.join(CACHE_ROOT, name.replace("/", "__"), version);
  if (!existsSync(path.join(dir, "package.json"))) {
    await pacote.extract(`${name}@${version}`, dir);
  }
  return { name, version, dir };
}

/** Never download more than this many dependencies for one package. */
const MAX_DEPENDENCIES = 30;

/**
 * Types often import from other packages (`@types/express` splits across several).
 * Unpacking the dependencies into `node_modules` lets those imports resolve, so the
 * snapshot sees the whole API instead of a stub.
 */
export async function fetchDependencies(pkg: FetchedPackage, depth = 2): Promise<void> {
  const fetched = new Set<string>();

  const walk = async (dir: string, left: number): Promise<void> => {
    if (left <= 0 || fetched.size >= MAX_DEPENDENCIES) return;

    let dependencies: Record<string, string> = {};
    try {
      const json = JSON.parse((await readFile(path.join(dir, "package.json"), "utf8")).replace(/^﻿/, ""));
      dependencies = json.dependencies ?? {};
    } catch {
      return;
    }

    for (const [name, range] of Object.entries(dependencies)) {
      if (fetched.size >= MAX_DEPENDENCIES || fetched.has(name)) continue;
      fetched.add(name);

      const target = path.join(pkg.dir, "node_modules", ...name.split("/"));
      try {
        if (!existsSync(path.join(target, "package.json"))) {
          await pacote.extract(`${name}@${range}`, target);
        }
        await walk(target, left - 1);
      } catch {
        // A dependency that won't install is not fatal: its types are simply missing.
      }
    }
  };

  await walk(pkg.dir, depth);
}
