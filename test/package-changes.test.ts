import { describe, expect, it } from "vitest";
import { allowsRequire, comparePackageJson } from "../src/core/package-changes.js";

describe("allowsRequire", () => {
  it("allows plain CommonJS packages", () => {
    expect(allowsRequire({ main: "index.js" })).toBe(true);
    expect(allowsRequire({})).toBe(true);
  });

  it("rejects ESM-only packages", () => {
    expect(allowsRequire({ type: "module", exports: "./index.js" })).toBe(false);
    expect(allowsRequire({ type: "module", exports: { ".": { import: "./a.js", default: "./a.js" } } })).toBe(false);
  });

  it("allows dual packages", () => {
    expect(allowsRequire({ type: "module", exports: { ".": { import: "./a.js", require: "./a.cjs" } } })).toBe(true);
    expect(allowsRequire({ type: "module", exports: { ".": { node: { default: "./a.cjs" } } } })).toBe(true);
  });
});

describe("comparePackageJson", () => {
  it("flags a switch to ESM-only (like chalk 4 → 5)", () => {
    const changes = comparePackageJson({ main: "source" }, { type: "module", exports: "./source/index.js" });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ severity: "breaking" });
    expect(changes[0]!.message).toContain("ESM-only");
  });

  it("flags a higher minimum Node version", () => {
    const changes = comparePackageJson({ engines: { node: ">=14" } }, { engines: { node: ">=18.17" } });
    expect(changes[0]!.message).toBe("now needs Node 18.17.0 or newer (was 14.0.0)");
  });

  it("stays quiet when nothing changed", () => {
    expect(comparePackageJson({ engines: { node: ">=18" } }, { engines: { node: ">=18" } })).toEqual([]);
  });
});
