import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { snapshotSource } from "../src/core/api-snapshot.js";
import { findUsages } from "../src/core/scan-code.js";

const API = snapshotSource(`
  export interface RequestConfig { timeout?: number; url?: string }
  export interface Static {
    get(url: string, config?: RequestConfig): Promise<string>;
    create(config?: RequestConfig): Static;
  }
  export interface Gone { a: string }
  export declare class Thing { constructor(name: string, code?: string); label: string }
  declare const client: Static;
  export default client;
`);

/** Runs the scanner over one in-memory file. */
function scan(code: string, packageName = "demo") {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  const file = project.createSourceFile("/src/app.ts", code);
  return findUsages([file], packageName, API);
}

describe("findUsages", () => {
  it("follows a default import to the type that describes it", () => {
    const usages = scan(`import client from "demo";\nclient.get("/users");`);
    expect(usages.map((u) => u.path)).toEqual(["Static.get"]);
    expect(usages[0]).toMatchObject({ line: 2, code: 'client.get("/users");' });
  });

  it("finds options passed inline", () => {
    const usages = scan(`import client from "demo";\nclient.get("/u", { timeout: 5, url: "x" });`);
    expect(usages.map((u) => u.path)).toEqual(["Static.get", "RequestConfig.timeout", "RequestConfig.url"]);
  });

  it("finds a named import even when it is never called", () => {
    const usages = scan(`import { Gone } from "demo";\nlet a: Gone;`);
    expect(usages.map((u) => u.path)).toContain("Gone");
  });

  it("handles renamed imports", () => {
    const usages = scan(`import { Gone as Old } from "demo";\nlet a: Old;`);
    expect(usages.map((u) => u.path)).toContain("Gone");
  });

  it("handles require()", () => {
    const usages = scan(`const client = require("demo");\nclient.create({ timeout: 1 });`);
    expect(usages.map((u) => u.path)).toEqual(["Static.create", "RequestConfig.timeout"]);
  });

  it("reports the deepest match of a chain", () => {
    const usages = scan(`import client from "demo";\nclient.create().get("/u");`);
    expect(usages.map((u) => u.path)).toContain("Static.create");
  });

  it("finds constructor calls", () => {
    const usages = scan(`import { Thing } from "demo";\nnew Thing("a", "b");`);
    expect(usages.map((u) => u.path)).toContain("Thing.constructor");
  });

  it("follows a local variable built from the package", () => {
    const usages = scan(`import { Thing } from "demo";\nconst t = new Thing("a", "b");\nt.label;`);
    expect(usages.map((u) => u.path)).toContain("Thing.label");
  });

  it("follows a local variable returned by a package call", () => {
    const usages = scan(`import client from "demo";\nconst c = client.create();\nc.get("/u");`);
    expect(usages.map((u) => u.path)).toContain("Static.get");
  });

  it("ignores identical names that came from somewhere else", () => {
    const usages = scan(`import client from "other";\nclient.get("/u");`);
    expect(usages).toEqual([]);
  });

  it("ignores properties that only look like package members", () => {
    const usages = scan(`import client from "demo";\nconst mine = { get: 1 };\nmine.get;`);
    expect(usages.map((u) => u.path)).toEqual([]);
  });
});
