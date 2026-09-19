import { describe, expect, it } from "vitest";
import { parseTarget } from "../src/core/parse-target.js";

describe("parseTarget", () => {
  it("reads a plain name and version", () => {
    expect(parseTarget("axios@2")).toEqual({ name: "axios", range: "2" });
  });

  it("keeps the @ of a scoped package", () => {
    expect(parseTarget("@tanstack/react-query@^5.0.0")).toEqual({ name: "@tanstack/react-query", range: "^5.0.0" });
  });

  it("defaults to latest when no version is given", () => {
    expect(parseTarget("react")).toEqual({ name: "react", range: "latest" });
    expect(parseTarget("@types/node")).toEqual({ name: "@types/node", range: "latest" });
    expect(parseTarget("react@")).toEqual({ name: "react", range: "latest" });
  });

  it("rejects empty input", () => {
    expect(() => parseTarget("  ")).toThrow();
  });
});
