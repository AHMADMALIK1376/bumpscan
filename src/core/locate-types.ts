import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Finds the main type file (`.d.ts`) of an unpacked package.
 * Returns undefined when the package ships no types (they may live in `@types/<name>`).
 */
export async function locateTypes(dir: string): Promise<string | undefined> {
  const pkg = JSON.parse((await readFile(path.join(dir, "package.json"), "utf8")).replace(/^﻿/, ""));

  const root = pkg.exports?.["."] ?? pkg.exports;
  const candidates: unknown[] = [
    pkg.types,
    pkg.typings,
    root?.types,
    root?.import?.types,
    root?.require?.types,
    "index.d.ts",
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const file = path.join(dir, candidate);
    if (existsSync(file)) return file;
  }
  return undefined;
}
