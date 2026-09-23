import { describe, expect, it } from "vitest";
import {
  dependencyItems,
  highlight,
  lastSegment,
  projectWideChanges,
  summarise,
  toProblems,
  type ScanResult,
} from "../src/report.js";

function scan(partial: Partial<ScanResult> = {}): ScanResult {
  return {
    from: { name: "express", version: "4.22.3" },
    to: { name: "express", version: "5.2.1" },
    hits: [],
    unusedChanges: [],
    filesScanned: 12,
    ...partial,
  };
}

const removedParam = {
  change: {
    path: "Request.param",
    severity: "breaking" as const,
    message: "method was removed",
    fix: "maybe use params",
  },
  usages: [{ file: "/repo/src/server.ts", line: 8, column: 14, code: 'const id = req.param("id");' }],
};

describe("highlight", () => {
  const line = 'const id = req.param("id");';

  it("marks the name, not the whole expression", () => {
    expect(highlight(line, 12, "param")).toEqual([15, 20]);
    expect(line.slice(15, 20)).toBe("param");
  });

  it("finds a name that sits before the reported column", () => {
    expect(highlight(line, 25, "param")).toEqual([15, 20]);
  });

  it("falls back to the rest of the line when the name is not there", () => {
    const [start, end] = highlight("await client.send();", 7, "missing");
    expect(start).toBe(6);
    expect(end).toBeGreaterThan(start);
  });

  it("never returns an empty range", () => {
    const [start, end] = highlight("", 1, "gone");
    expect(end).toBeGreaterThan(start);
  });
});

describe("lastSegment", () => {
  it("takes the member name", () => {
    expect(lastSegment("Request.param")).toBe("param");
    expect(lastSegment("Level")).toBe("Level");
  });
});

describe("toProblems", () => {
  const lineTextOf = () => 'const id = req.param("id");';

  it("makes one problem per usage, with the fix in the message", () => {
    const problems = toProblems(scan({ hits: [removedParam] }), lineTextOf);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: "/repo/src/server.ts", line: 7, severity: "error" });
    expect(problems[0]!.message).toContain("method was removed");
    expect(problems[0]!.message).toContain("Fix: maybe use params");
    expect(problems[0]!.message).toContain("4.22.3 → 5.2.1");
  });

  it("marks risky changes as warnings, and can leave them out", () => {
    const risky = {
      change: { path: "Express.listen", severity: "maybe" as const, message: "types changed" },
      usages: [{ file: "/repo/src/server.ts", line: 8, column: 1, code: "app.listen(3000);" }],
    };
    expect(toProblems(scan({ hits: [risky] }), lineTextOf)[0]?.severity).toBe("warning");
    expect(toProblems(scan({ hits: [risky] }), lineTextOf, false)).toEqual([]);
  });

  it("ignores safe changes", () => {
    const safe = {
      change: { path: "Express.new", severity: "safe" as const, message: "new method" },
      usages: [{ file: "/repo/a.ts", line: 1, column: 1, code: "" }],
    };
    expect(toProblems(scan({ hits: [safe] }), lineTextOf)).toEqual([]);
  });
});

describe("projectWideChanges", () => {
  it("picks out the changes that belong to no line", () => {
    const wide = {
      change: { path: "(package)", severity: "breaking" as const, message: "is now ESM-only" },
      usages: [],
    };
    expect(projectWideChanges(scan({ hits: [wide, removedParam] }))).toHaveLength(1);
  });
});

describe("summarise", () => {
  it("says plainly when nothing is affected", () => {
    expect(summarise(scan())).toContain("nothing in your code is affected");
  });

  it("counts what was found", () => {
    expect(summarise(scan({ hits: [removedParam] }))).toContain("1 breaking, 0 risky");
  });
});

describe("dependencyItems", () => {
  it("puts the worst first and hides up-to-date packages", () => {
    const items = dependencyItems({
      filesScanned: 5,
      results: [
        { name: "safe-one", from: "1.0.0", to: "2.0.0", breaking: 0, risky: 0 },
        { name: "up-to-date", from: "3.0.0", to: "3.0.0", breaking: 0, risky: 0 },
        { name: "risky-one", from: "1.0.0", to: "2.0.0", breaking: 0, risky: 3 },
        { name: "bad-one", from: "1.0.0", to: "2.0.0", breaking: 2, risky: 1 },
      ],
    });
    expect(items.map((item) => item.name)).toEqual(["bad-one", "risky-one", "safe-one"]);
    expect(items[0]!.detail).toContain("2 breaking");
  });

  it("explains a dependency that could not be checked", () => {
    const items = dependencyItems({
      filesScanned: 1,
      results: [{ name: "odd", from: "1.0.0", to: "2.0.0", breaking: 0, risky: 0, error: "no types" }],
    });
    expect(items[0]!.detail).toContain("could not check: no types");
  });
});
