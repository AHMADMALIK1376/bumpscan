import { readFile } from "node:fs/promises";
import path from "node:path";
import { listPackageFolders } from "./workspaces.js";

export interface Dependency {
  name: string;
  /** The range written in package.json, e.g. `^4.1.0`. */
  range: string;
  dev: boolean;
  /** Folder of the package.json it came from. */
  folder: string;
}

async function dependenciesOf(folder: string): Promise<Dependency[]> {
  const file = path.join(folder, "package.json");
  let json: Record<string, any>;
  try {
    json = JSON.parse((await readFile(file, "utf8")).replace(/^﻿/, ""));
  } catch {
    throw new Error(`No readable package.json in ${folder}`);
  }

  const collect = (field: string, dev: boolean): Dependency[] =>
    Object.entries(json[field] ?? {})
      .filter(([name, range]) => typeof range === "string" && !name.startsWith("@types/"))
      // A workspace link like "workspace:*" is not on npm, so there is nothing to compare.
      .filter(([, range]) => !(range as string).startsWith("workspace:"))
      .map(([name, range]) => ({ name, range: range as string, dev, folder }));

  return [...collect("dependencies", false), ...collect("devDependencies", true)];
}

/**
 * Every dependency in the project, including its workspace packages. `@types/…` entries
 * are left out: they follow the package they describe, so checking them separately is noise.
 * A package used by several workspaces is listed once.
 */
export async function listDependencies(cwd: string): Promise<Dependency[]> {
  const folders = await listPackageFolders(cwd);
  const lists = await Promise.all(
    folders.map(async (folder, index) => {
      try {
        return await dependenciesOf(folder);
      } catch (error) {
        // The root must be readable; a broken workspace folder is simply skipped.
        if (index === 0) throw error;
        return [];
      }
    }),
  );

  const seen = new Map<string, Dependency>();
  for (const dependency of lists.flat()) {
    if (!seen.has(dependency.name)) seen.set(dependency.name, dependency);
  }
  return [...seen.values()];
}

/** Runs `worker` over every item, a few at a time, keeping the input order. */
export async function inParallel<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const runner = async () => {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await worker(items[index]!);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}
