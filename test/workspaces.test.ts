import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listDependencies } from "../src/core/dependencies.js";
import { listPackageFolders } from "../src/core/workspaces.js";

/** Builds a temporary project from a map of relative path → file contents. */
async function project(files: Record<string, string>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bumpscan-ws-"));
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(dir, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  return dir;
}

describe("listPackageFolders", () => {
  it("returns just the root for a plain project", async () => {
    const dir = await project({ "package.json": '{"name":"app"}' });
    expect(await listPackageFolders(dir)).toEqual([dir]);
  });

  it("expands npm workspace patterns", async () => {
    const dir = await project({
      "package.json": '{"name":"root","workspaces":["packages/*"]}',
      "packages/api/package.json": '{"name":"api"}',
      "packages/web/package.json": '{"name":"web"}',
    });
    const folders = await listPackageFolders(dir);
    expect(folders).toHaveLength(3);
    expect(folders.map((f) => path.basename(f)).sort()).toEqual([path.basename(dir), "api", "web"].sort());
  });

  it("reads pnpm-workspace.yaml", async () => {
    const dir = await project({
      "package.json": '{"name":"root"}',
      "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n",
      "apps/site/package.json": '{"name":"site"}',
    });
    expect((await listPackageFolders(dir)).map((f) => path.basename(f))).toContain("site");
  });
});

describe("listDependencies in a monorepo", () => {
  it("collects dependencies from every workspace, listing each package once", async () => {
    const dir = await project({
      "package.json": '{"name":"root","workspaces":["packages/*"],"devDependencies":{"vitest":"^5.0.0"}}',
      "packages/api/package.json": '{"name":"api","dependencies":{"express":"^4.0.0","axios":"^1.0.0"}}',
      "packages/web/package.json": '{"name":"web","dependencies":{"axios":"^1.0.0"}}',
    });
    const names = (await listDependencies(dir)).map((d) => d.name).sort();
    expect(names).toEqual(["axios", "express", "vitest"]);
  });

  it("skips workspace: links, which are not on npm", async () => {
    const dir = await project({
      "package.json": '{"name":"root","workspaces":["packages/*"]}',
      "packages/web/package.json": '{"name":"web","dependencies":{"api":"workspace:*","axios":"^1.0.0"}}',
    });
    expect((await listDependencies(dir)).map((d) => d.name)).toEqual(["axios"]);
  });
});
