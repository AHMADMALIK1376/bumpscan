import { readFile } from "node:fs/promises";
import path from "node:path";
import { listPackageFolders } from "./workspaces.js";

export interface CurrentVersion {
  version: string;
  /** Where we learned it: the installed copy is exact, package.json is only a range. */
  source: "node_modules" | "package.json";
}

async function readJson(file: string): Promise<Record<string, any> | undefined> {
  try {
    // Some Windows editors save a byte-order mark first, which JSON.parse rejects.
    return JSON.parse((await readFile(file, "utf8")).replace(/^﻿/, ""));
  } catch {
    return undefined;
  }
}

/** Finds which version of `name` the project in `cwd` uses today, workspaces included. */
export async function findCurrentVersion(cwd: string, name: string): Promise<CurrentVersion | undefined> {
  const installed = await readJson(path.join(cwd, "node_modules", name, "package.json"));
  if (typeof installed?.version === "string") return { version: installed.version, source: "node_modules" };

  for (const folder of await listPackageFolders(cwd)) {
    const pkg = await readJson(path.join(folder, "package.json"));
    const range = pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name] ?? pkg?.peerDependencies?.[name];
    if (typeof range === "string" && !range.startsWith("workspace:")) {
      return { version: range, source: "package.json" };
    }
  }

  return undefined;
}
