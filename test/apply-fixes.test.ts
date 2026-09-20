import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyFixes } from "../src/core/apply-fixes.js";
import type { Hit } from "../src/index.js";

async function fileWith(text: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bumpscan-fix-"));
  const file = path.join(dir, "app.ts");
  await writeFile(file, text);
  return file;
}

function renameHit(file: string, from: string, to: string, range: [number, number]): Hit {
  return {
    change: {
      path: `Config.${from}`,
      kind: "renamed",
      severity: "breaking",
      message: `renamed to ${to}`,
      renamedTo: to,
    },
    usages: [{ path: `Config.${from}`, file, line: 1, column: 1, code: "", nameRange: range }],
  };
}

describe("applyFixes", () => {
  it("renames a property in place", async () => {
    const text = `client.get("/u", { timeout: 5 });`;
    const file = await fileWith(text);
    const start = text.indexOf("timeout");

    const { edits } = await applyFixes([renameHit(file, "timeout", "timeoutMs", [start, start + 7])]);

    expect(edits).toHaveLength(1);
    expect(await readFile(file, "utf8")).toBe(`client.get("/u", { timeoutMs: 5 });`);
  });

  it("applies several renames in one file without shifting the others", async () => {
    const text = `a.timeout; b.timeout;`;
    const file = await fileWith(text);
    const first = text.indexOf("timeout");
    const second = text.lastIndexOf("timeout");

    await applyFixes([
      renameHit(file, "timeout", "timeoutMs", [first, first + 7]),
      renameHit(file, "timeout", "timeoutMs", [second, second + 7]),
    ]);

    expect(await readFile(file, "utf8")).toBe(`a.timeoutMs; b.timeoutMs;`);
  });

  it("leaves the file alone in a dry run", async () => {
    const text = `x.timeout;`;
    const file = await fileWith(text);
    const start = text.indexOf("timeout");

    const { edits } = await applyFixes([renameHit(file, "timeout", "timeoutMs", [start, start + 7])], {
      dryRun: true,
    });

    expect(edits).toHaveLength(1);
    expect(await readFile(file, "utf8")).toBe(text);
  });

  it("keeps a byte-order mark and still edits at the right place", async () => {
    const body = `x.timeout;`;
    const file = await fileWith(`﻿${body}`);
    const start = body.indexOf("timeout");

    await applyFixes([renameHit(file, "timeout", "timeoutMs", [start, start + 7])]);

    expect(await readFile(file, "utf8")).toBe(`﻿x.timeoutMs;`);
  });

  it("refuses to edit when the text is not what was scanned", async () => {
    const file = await fileWith(`something else entirely`);
    const { edits } = await applyFixes([renameHit(file, "timeout", "timeoutMs", [0, 7])]);
    expect(edits).toEqual([]);
  });

  it("reports breaking changes it cannot fix", async () => {
    const hit: Hit = {
      change: { path: "Request.param", kind: "removed", severity: "breaking", message: "method was removed" },
      usages: [],
    };
    const { skipped } = await applyFixes([hit]);
    expect(skipped).toEqual([hit]);
  });
});
