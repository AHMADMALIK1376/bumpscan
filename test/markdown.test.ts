import { describe, expect, it } from "vitest";
import { markdownReport, titleToTarget } from "../src/core/markdown.js";
import type { ScanResult } from "../src/index.js";

describe("titleToTarget", () => {
  it("reads a Dependabot title", () => {
    expect(titleToTarget("chore(deps): bump axios from 0.27.2 to 1.20.0")).toBe("axios@1.20.0");
  });

  it("reads a Renovate title", () => {
    expect(titleToTarget("Update dependency express to v5.2.1")).toBe("express@5.2.1");
  });

  it("handles scoped packages", () => {
    expect(titleToTarget("bump @tanstack/react-query from 4.0.0 to v5.1.0")).toBe("@tanstack/react-query@5.1.0");
  });

  it("returns nothing for an ordinary title", () => {
    expect(titleToTarget("fix: correct the login redirect")).toBeUndefined();
  });
});

/** The smallest shape markdownReport needs. */
function result(partial: Partial<ScanResult>): ScanResult {
  return {
    from: { name: "axios", version: "0.27.2", dir: "", types: undefined },
    to: { name: "axios", version: "1.20.0", dir: "", types: undefined },
    changes: [],
    hits: [],
    unusedChanges: [],
    filesScanned: 12,
    ...partial,
  } as ScanResult;
}

describe("markdownReport", () => {
  it("says so when nothing is affected", () => {
    const text = markdownReport(result({}));
    expect(text).toContain("<!-- bumpscan -->");
    expect(text).toContain("✅");
  });

  it("puts breaking changes in a table with the file and line", () => {
    const text = markdownReport(
      result({
        hits: [
          {
            change: { path: "Request.param", kind: "removed", severity: "breaking", message: "method was removed" },
            usages: [{ path: "Request.param", file: "/repo/src/server.ts", line: 6, column: 14, code: "req.param()" }],
          },
        ],
      }),
      "/repo",
    );
    expect(text).toContain("❌ Breaks your code (1)");
    expect(text).toContain("`Request.param`");
    expect(text).toContain("`src/server.ts:6`");
  });

  it("folds risky changes into a details block", () => {
    const text = markdownReport(
      result({
        hits: [
          {
            change: { path: "Axios.get", kind: "changed", severity: "maybe", message: "type changed" },
            usages: [],
          },
        ],
      }),
    );
    expect(text).toContain("<details>");
    expect(text).toContain("⚠️ Might break your code (1)");
  });
});
