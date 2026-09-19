import { describe, expect, it } from "vitest";
import { snapshotSource } from "../src/core/api-snapshot.js";
import { compareApi, type ApiChange } from "../src/core/compare-api.js";

function diff(before: string, after: string) {
  return compareApi(snapshotSource(before), snapshotSource(after));
}

function find(changes: ApiChange[], path: string) {
  return changes.find((c) => c.path === path);
}

describe("snapshotSource", () => {
  it("lists exports and their members", () => {
    const api = snapshotSource(`
      export interface Config { timeout?: number; baseURL: string }
      export declare function get(url: string, config?: Config): Promise<unknown>;
      export declare class Client { private secret: string; request(): void }
    `);
    expect([...api.keys()].sort()).toEqual(
      ["Client", "Client.request", "Config", "Config.baseURL", "Config.timeout", "get"].sort(),
    );
  });
});

describe("compareApi", () => {
  it("reports removed exports once, not once per member", () => {
    const changes = diff(`export interface Old { a: string; b: string }`, ``);
    expect(changes).toEqual([
      { path: "Old", kind: "removed", severity: "breaking", message: "interface was removed" },
    ]);
  });

  it("spots a renamed property", () => {
    const changes = diff(
      `export interface Config { timeout?: number }`,
      `export interface Config { timeoutMs?: number }`,
    );
    expect(find(changes, "Config.timeout")).toMatchObject({ kind: "renamed", severity: "breaking", message: "renamed to timeoutMs" });
    expect(find(changes, "Config.timeoutMs")).toBeUndefined();
  });

  it("flags an option that became required", () => {
    const changes = diff(`export interface Config { url?: string }`, `export interface Config { url: string }`);
    expect(find(changes, "Config.url")).toMatchObject({ severity: "breaking", message: "is now required" });
  });

  it("flags a function that now needs more arguments", () => {
    const changes = diff(
      `export declare function get(url: string): void;`,
      `export declare function get(url: string, options: object): void;`,
    );
    expect(find(changes, "get")).toMatchObject({ severity: "breaking", message: "now needs at least 2 arguments, was 1" });
  });

  it("keeps overloads that still accept the old calls", () => {
    const changes = diff(
      `export declare function get(url: string): void;`,
      `export declare function get(url: string): void;
       export declare function get(url: string, options: object): void;`,
    );
    expect(find(changes, "get")?.severity).not.toBe("breaking");
  });

  it("calls a type change 'might break'", () => {
    const changes = diff(`export type Id = string;`, `export type Id = string | number;`);
    expect(find(changes, "Id")).toMatchObject({ severity: "maybe", before: "string", after: "string | number" });
  });

  it("ignores formatting and parameter renames", () => {
    const changes = diff(
      `export declare function get(url: string): { a: string; };`,
      `export declare function get(href: string): {
         a: string
       };`,
    );
    expect(changes).toEqual([]);
  });

  it("treats a new optional member as safe and a new required one as a risk", () => {
    const changes = diff(
      `export interface Config { a: string }`,
      `export interface Config { a: string; b?: string; c: string }`,
    );
    expect(find(changes, "Config.b")?.severity).toBe("safe");
    expect(find(changes, "Config.c")?.severity).toBe("maybe");
  });

  it("does not call a member removed when it moved to a base interface", () => {
    const changes = diff(
      `export interface Instance { get(): void }
       export interface Static extends Instance { create(): Instance }`,
      `export interface Instance { get(): void; create(): Instance }
       export interface Static extends Instance {}`,
    );
    expect(find(changes, "Static.create")).toBeUndefined();
    expect(changes.filter((c) => c.severity === "breaking")).toEqual([]);
  });

  it("does not list members inherited from built-in types like Promise", () => {
    const changes = diff(
      `export interface Result extends Promise<string> {}`,
      `export type Result = Promise<string>;`,
    );
    expect(changes.map((c) => c.path)).toEqual(["Result"]);
  });

  it("catches a constructor that lost an argument, even when it was inherited before", () => {
    const changes = diff(
      `export declare class BaseError { constructor(message?: string, code?: string, config?: object, request?: any) }
       export declare class CanceledError extends BaseError {}`,
      `export declare class BaseError { constructor(message?: string, code?: string, config?: object, request?: any) }
       export declare class CanceledError extends BaseError { constructor(message?: string, config?: object, request?: any) }`,
    );
    expect(find(changes, "CanceledError.constructor")).toMatchObject({
      severity: "breaking",
      message: "no longer accepts 4 arguments",
    });
  });

  it("ignores the `this` parameter when counting arguments", () => {
    const changes = diff(
      `export declare function run(data: string): void;`,
      `export declare function run(this: object, data: string): void;`,
    );
    expect(find(changes, "run")?.severity).not.toBe("breaking");
  });

  it("treats method → function-typed property as 'might break', not breaking", () => {
    const changes = diff(
      `export interface Static { all(values: unknown[]): void }`,
      `export interface Static { all: (values: unknown[]) => void }`,
    );
    expect(find(changes, "Static.all")).toMatchObject({ severity: "maybe", message: "was a method, is now a property" });
  });

  it("reports an export that changed kind once, not once per member", () => {
    const changes = diff(
      `export interface Chalk { red: string; blue: string; (text: string): string }`,
      `export declare const Chalk: new () => object;`,
    );
    expect(changes.map((c) => c.path)).toEqual(["Chalk"]);
  });

  it("still reports members removed from a type that stays the same kind", () => {
    const changes = diff(`export interface Options { a: string }`, `export interface Options {}`);
    expect(find(changes, "Options.a")).toMatchObject({ kind: "removed", severity: "breaking" });
  });

  it("sorts breaking changes first", () => {
    const changes = diff(
      `export type A = string; export declare const gone: number;`,
      `export type A = number; export declare function added(): void;`,
    );
    expect(changes.map((c) => c.severity)).toEqual(["breaking", "maybe", "safe"]);
  });
});
