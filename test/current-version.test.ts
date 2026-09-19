import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findCurrentVersion } from "../src/core/current-version.js";

async function project(packageJson: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bumpscan-test-"));
  await writeFile(path.join(dir, "package.json"), packageJson);
  return dir;
}

describe("findCurrentVersion", () => {
  it("reads the range from package.json", async () => {
    const dir = await project('{"dependencies":{"axios":"^0.27.0"}}');
    expect(await findCurrentVersion(dir, "axios")).toEqual({ version: "^0.27.0", source: "package.json" });
  });

  it("reads a package.json saved with a byte-order mark", async () => {
    const dir = await project('﻿{"devDependencies":{"vitest":"^5.0.0"}}');
    expect(await findCurrentVersion(dir, "vitest")).toEqual({ version: "^5.0.0", source: "package.json" });
  });

  it("returns undefined for a package the project does not use", async () => {
    const dir = await project('{"dependencies":{}}');
    expect(await findCurrentVersion(dir, "react")).toBeUndefined();
  });
});
