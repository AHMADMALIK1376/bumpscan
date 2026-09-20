import { describe, expect, it } from "vitest";
import { typesPackageName } from "../src/core/fetch-package.js";

describe("typesPackageName", () => {
  it("maps a plain package", () => {
    expect(typesPackageName("express")).toBe("@types/express");
  });

  it("flattens a scoped package the way DefinitelyTyped does", () => {
    expect(typesPackageName("@tanstack/react-query")).toBe("@types/tanstack__react-query");
  });
});
