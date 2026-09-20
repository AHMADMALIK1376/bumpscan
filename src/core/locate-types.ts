import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Project } from "ts-morph";

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

/**
 * True when the types import from packages that are not on disk. Those imports come out
 * as `any`, which hides most of the API, so the dependencies are worth downloading.
 */
export function hasUnresolvedImports(typesFile: string): boolean {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { skipLibCheck: true, noEmit: true },
  });
  const source = project.addSourceFileAtPath(typesFile);
  project.resolveSourceFileDependencies();

  return [...source.getImportDeclarations(), ...source.getExportDeclarations()].some((declaration) => {
    const specifier = declaration.getModuleSpecifierValue();
    // Relative imports live inside the package and are already unpacked.
    return !!specifier && !specifier.startsWith(".") && !declaration.getModuleSpecifierSourceFile();
  });
}
