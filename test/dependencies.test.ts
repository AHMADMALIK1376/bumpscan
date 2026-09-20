import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inParallel, listDependencies } from "../src/core/dependencies.js";

async function project(packageJson: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bumpscan-deps-"));
  await writeFile(path.join(dir, "package.json"), packageJson);
  return dir;
}

describe("listDependencies", () => {
  it("lists dependencies and devDependencies", async () => {
    const dir = await project('{"dependencies":{"axios":"^1.0.0"},"devDependencies":{"vitest":"^5.0.0"}}');
    expect(await listDependencies(dir)).toEqual([
      { name: "axios", range: "^1.0.0", dev: false },
      { name: "vitest", range: "^5.0.0", dev: true },
    ]);
  });

  it("skips @types packages, which follow their own package", async () => {
    const dir = await project('{"devDependencies":{"@types/node":"^22.0.0","typescript":"^5.0.0"}}');
    expect((await listDependencies(dir)).map((d) => d.name)).toEqual(["typescript"]);
  });

  it("explains itself when there is no package.json", async () => {
    await expect(listDependencies(path.join(os.tmpdir(), "bumpscan-not-here"))).rejects.toThrow(/package\.json/);
  });
});

describe("inParallel", () => {
  it("keeps the order of the input", async () => {
    const result = await inParallel([1, 2, 3, 4, 5], 2, async (n) => n * 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await inParallel([1, 2, 3, 4, 5, 6], 2, async () => {
      peak = Math.max(peak, ++running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
});
