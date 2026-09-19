import { existsSync } from "node:fs";
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

/** Downloads and unpacks one exact version. Each version is fetched once, then reused. */
export async function fetchPackage(name: string, version: string): Promise<FetchedPackage> {
  const dir = path.join(CACHE_ROOT, name.replace("/", "__"), version);
  if (!existsSync(path.join(dir, "package.json"))) {
    await pacote.extract(`${name}@${version}`, dir);
  }
  return { name, version, dir };
}
