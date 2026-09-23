import { describe, expect, it } from "vitest";
import { isSafeTarget, scanOne } from "../src/run.js";

describe("isSafeTarget", () => {
  it("accepts ordinary packages and ranges", () => {
    for (const target of ["express@5", "axios@1.20.0", "chalk@^5.0.0", "zod@latest", "ts-node@>=10 <11".replace(" ", "")]) {
      expect(isSafeTarget(target), target).toBe(true);
    }
  });

  it("accepts scoped packages", () => {
    expect(isSafeTarget("@tanstack/react-query@5.1.0")).toBe(true);
    expect(isSafeTarget("@types/node@^22")).toBe(true);
  });

  it("rejects anything that could reach the shell", () => {
    for (const target of [
      "express@5 && calc",
      "express@5; rm -rf /",
      "express@5 | more",
      "express@$(whoami)",
      "express@5`whoami`",
      'express@5"',
      "../../etc/passwd@1",
      "express@5\nwhoami",
      "",
    ]) {
      expect(isSafeTarget(target), target).toBe(false);
    }
  });

  it("rejects a name without a version", () => {
    expect(isSafeTarget("express")).toBe(false);
  });

  it("refuses to run an unsafe target", async () => {
    await expect(scanOne("express@5 && calc", ".", "npx")).rejects.toThrow(/not a package name/);
  });
});
