import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function readJson(file: string): Promise<Record<string, any> | undefined> {
  try {
    return JSON.parse((await readFile(file, "utf8")).replace(/^﻿/, ""));
  } catch {
    return undefined;
  }
}

/** Expands one workspace pattern, e.g. `packages/*` or `apps/web`. */
async function expand(root: string, pattern: string): Promise<string[]> {
  const clean = pattern.replace(/\/\*\*$/, "/*").replace(/\/$/, "");
  const star = clean.indexOf("*");
  if (star === -1) return [path.join(root, clean)];

  const parent = path.join(root, clean.slice(0, star).replace(/\/$/, ""));
  const suffix = clean.slice(star + 1).replace(/^\//, "");
  try {
    const entries = await readdir(parent, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => path.join(parent, entry.name, suffix));
  } catch {
    return [];
  }
}

/** Workspace patterns from package.json or pnpm-workspace.yaml. */
async function workspacePatterns(root: string): Promise<string[]> {
  const pkg = await readJson(path.join(root, "package.json"));
  const field = pkg?.workspaces;
  const fromPackageJson: string[] = Array.isArray(field) ? field : Array.isArray(field?.packages) ? field.packages : [];

  let fromPnpm: string[] = [];
  try {
    const yaml = await readFile(path.join(root, "pnpm-workspace.yaml"), "utf8");
    // The file is tiny and the shape is fixed, so a full YAML parser is not worth a dependency.
    fromPnpm = [...yaml.matchAll(/^\s*-\s*['"]?([^'"\n]+?)['"]?\s*$/gm)].map((match) => match[1]!);
  } catch {
    // No pnpm workspace file.
  }

  return [...fromPackageJson, ...fromPnpm].filter((pattern) => !pattern.startsWith("!"));
}

/**
 * Every folder in the project holding a package.json: the root first, then any
 * workspace packages. A plain project simply gets one folder back.
 */
export async function listPackageFolders(root: string): Promise<string[]> {
  const patterns = await workspacePatterns(root);
  const expanded = (await Promise.all(patterns.map((pattern) => expand(root, pattern)))).flat();

  const folders = [root];
  for (const folder of expanded) {
    if (folder !== root && !folders.includes(folder) && (await readJson(path.join(folder, "package.json")))) {
      folders.push(folder);
    }
  }
  return folders;
}
