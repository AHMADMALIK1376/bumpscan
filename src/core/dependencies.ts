import { readFile } from "node:fs/promises";
import path from "node:path";

export interface Dependency {
  name: string;
  /** The range written in package.json, e.g. `^4.1.0`. */
  range: string;
  dev: boolean;
}

/**
 * Every dependency listed in the project's package.json. `@types/…` entries are left
 * out: they follow the package they describe, so checking them separately is noise.
 */
export async function listDependencies(cwd: string): Promise<Dependency[]> {
  const file = path.join(cwd, "package.json");
  let json: Record<string, any>;
  try {
    json = JSON.parse((await readFile(file, "utf8")).replace(/^﻿/, ""));
  } catch {
    throw new Error(`No readable package.json in ${cwd}`);
  }

  const collect = (field: string, dev: boolean): Dependency[] =>
    Object.entries(json[field] ?? {})
      .filter(([name, range]) => typeof range === "string" && !name.startsWith("@types/"))
      .map(([name, range]) => ({ name, range: range as string, dev }));

  return [...collect("dependencies", false), ...collect("devDependencies", true)];
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
