import { Node, Project, SyntaxKind, type SourceFile } from "ts-morph";
import type { ApiSnapshot } from "./api-snapshot.js";

/** One place in the user's code that touches something from the package. */
export interface Usage {
  /** Path into the package API, e.g. `AxiosStatic.create`. */
  path: string;
  file: string;
  line: number;
  column: number;
  /** The line of code, trimmed. */
  code: string;
}

const SOURCE_GLOBS = [
  "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
  "!**/node_modules/**",
  "!**/dist/**",
  "!**/build/**",
  "!**/out/**",
  "!**/.next/**",
  "!**/coverage/**",
  "!**/*.min.js",
];

/** Loads the project's own source files (no type checking, so it stays fast). */
export function loadSourceFiles(cwd: string): SourceFile[] {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, noEmit: true },
  });
  project.addSourceFilesAtPaths(SOURCE_GLOBS.map((g) => (g.startsWith("!") ? `!${cwd}/${g.slice(1)}` : `${cwd}/${g}`)));
  return project.getSourceFiles();
}

/** `AxiosStatic` from `AxiosStatic<T>`; undefined when the type is not a plain name. */
function baseTypeName(type: string | undefined): string | undefined {
  const match = /^([A-Za-z_$][\w$]*)/.exec(type?.trim() ?? "");
  return match?.[1];
}

/**
 * Follows a variable to the type that describes it, so `axios.create` (a variable
 * of type `AxiosStatic`) is looked up as `AxiosStatic.create`.
 */
function resolveAlias(snapshot: ApiSnapshot, path: string, depth = 0): string {
  if (depth > 5) return path;
  const entry = snapshot.get(path);
  if (!entry?.type) return path;
  const base = baseTypeName(entry.type);
  if (!base || base === path || !snapshot.has(base)) return path;
  return resolveAlias(snapshot, base, depth + 1);
}

/** Walks `a.b.c` from a starting path, returning every step that exists in the package API. */
function walkMembers(snapshot: ApiSnapshot, start: string, segments: string[]): string[] {
  const matched: string[] = [];
  let current = start;

  for (const segment of segments) {
    const owner = snapshot.has(`${current}.${segment}`) ? current : resolveAlias(snapshot, current);
    const next = owner ? `${owner}.${segment}` : segment;
    if (!snapshot.has(next)) break;
    matched.push(next);
    current = next;
  }
  return matched;
}

/** Where an imported name starts in the API: `default`, an export name, or "" for `import * as ns`. */
interface Binding {
  local: string;
  root: string;
  namespace: boolean;
}

function importBindings(file: SourceFile, packageName: string): Binding[] {
  const bindings: Binding[] = [];
  const fromPackage = (spec: string) => spec === packageName || spec.startsWith(`${packageName}/`);

  for (const decl of file.getImportDeclarations()) {
    if (!fromPackage(decl.getModuleSpecifierValue())) continue;

    const defaultImport = decl.getDefaultImport();
    if (defaultImport) bindings.push({ local: defaultImport.getText(), root: "default", namespace: false });

    const namespaceImport = decl.getNamespaceImport();
    if (namespaceImport) bindings.push({ local: namespaceImport.getText(), root: "", namespace: true });

    for (const named of decl.getNamedImports()) {
      bindings.push({ local: named.getAliasNode()?.getText() ?? named.getName(), root: named.getName(), namespace: false });
    }
  }

  // `const axios = require("axios")` and `const { z } = require("zod")`
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!Node.isCallExpression(call) || call.getExpression().getText() !== "require") continue;
    const arg = call.getArguments()[0];
    if (!Node.isStringLiteral(arg) || !fromPackage(arg.getLiteralValue())) continue;

    const declaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    const nameNode = Node.isVariableDeclaration(declaration) ? declaration.getNameNode() : undefined;
    if (Node.isIdentifier(nameNode)) {
      bindings.push({ local: nameNode.getText(), root: "", namespace: true });
    } else if (Node.isObjectBindingPattern(nameNode)) {
      for (const element of nameNode.getElements()) {
        const source = element.getPropertyNameNode()?.getText() ?? element.getName();
        bindings.push({ local: element.getName(), root: source, namespace: false });
      }
    }
  }

  return bindings;
}

function usageAt(node: Node, path: string): Usage {
  const file = node.getSourceFile();
  const { line, column } = file.getLineAndColumnAtPos(node.getStart());
  return {
    path,
    file: file.getFilePath(),
    line,
    column,
    code: file.getFullText().split(/\r?\n/)[line - 1]?.trim() ?? "",
  };
}

/**
 * Options passed inline, e.g. `axios.get(url, { timeout: 5 })`. The option object's type
 * comes from the function's own signature, so no type checker is needed.
 */
function optionUsages(snapshot: ApiSnapshot, call: Node, calleePath: string): Usage[] {
  if (!Node.isCallExpression(call)) return [];
  const signatures = snapshot.get(calleePath)?.signatures;
  if (!signatures) return [];

  const usages: Usage[] = [];
  call.getArguments().forEach((arg, index) => {
    if (!Node.isObjectLiteralExpression(arg)) return;
    const paramType = signatures.map((s) => s.params[index]?.type).find(Boolean);
    const optionType = baseTypeName(paramType);
    if (!optionType || !snapshot.has(optionType)) return;

    for (const property of arg.getProperties()) {
      if (!Node.isPropertyAssignment(property) && !Node.isShorthandPropertyAssignment(property)) continue;
      const path = `${optionType}.${property.getName()}`;
      if (snapshot.has(path)) usages.push(usageAt(property, path));
    }
  });
  return usages;
}

/** The deepest API path an expression like `axios.create` refers to, plus the node holding it. */
interface Match {
  path: string;
  node: Node;
}

function matchChain(snapshot: ApiSnapshot, byLocal: Map<string, Binding>, identifier: Node): Match | undefined {
  const binding = byLocal.get(identifier.getText());
  if (!binding) return undefined;

  const segments: string[] = [];
  const nodes: Node[] = [];
  let chain: Node = identifier;
  for (;;) {
    const above = chain.getParent();
    if (!Node.isPropertyAccessExpression(above) || above.getExpression() !== chain) break;
    segments.push(above.getName());
    nodes.push(above);
    chain = above;
  }

  // `const x = require("pkg")` could be the module itself or its default export, so try both.
  const roots = binding.namespace ? ["", "default"] : [binding.root];
  const matched = roots
    .map((root) => walkMembers(snapshot, root, segments))
    .reduce((best, current) => (current.length > best.length ? current : best));

  if (matched.length) {
    const last = matched.length - 1;
    return { path: matched[last]!, node: nodes[last]! };
  }
  if (!binding.namespace && !segments.length && snapshot.has(binding.root)) {
    return { path: binding.root, node: identifier };
  }
  return undefined;
}

/** What you get back from `new Thing()` or `thing.create()`, so local variables can be followed. */
function resultOf(snapshot: ApiSnapshot, path: string, isNew: boolean): string | undefined {
  const entry = snapshot.get(path);
  if (!entry) return undefined;
  if (isNew) return entry.kind === "class" || entry.kind === "interface" ? path : undefined;
  const returns = entry.signatures?.map((s) => s.returns).find(Boolean);
  const base = baseTypeName(returns);
  return base && snapshot.has(base) ? base : undefined;
}

/** The `a` in `a.b.c`. */
function firstIdentifier(node: Node): Node {
  let current = node;
  while (Node.isPropertyAccessExpression(current)) current = current.getExpression();
  return current;
}

/**
 * Adds local variables that hold something from the package, e.g.
 * `const option = new Option(...)` or `const client = axios.create()`.
 * Runs twice so a variable built from another variable is found too.
 */
function addLocalBindings(file: SourceFile, byLocal: Map<string, Binding>, snapshot: ApiSnapshot) {
  for (let round = 0; round < 2; round++) {
    for (const declaration of file.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const name = declaration.getNameNode();
      if (!Node.isIdentifier(name) || byLocal.has(name.getText())) continue;

      const initializer = declaration.getInitializer();
      const isNew = Node.isNewExpression(initializer);
      if (!isNew && !Node.isCallExpression(initializer)) continue;

      const root = firstIdentifier(initializer.getExpression());
      if (!Node.isIdentifier(root)) continue;

      const match = matchChain(snapshot, byLocal, root);
      const result = match && resultOf(snapshot, match.path, isNew);
      if (result) byLocal.set(name.getText(), { local: name.getText(), root: result, namespace: false });
    }
  }
}

/** Finds every place the project uses something from the package. */
export function findUsages(files: SourceFile[], packageName: string, snapshot: ApiSnapshot): Usage[] {
  const usages: Usage[] = [];

  for (const file of files) {
    const bindings = importBindings(file, packageName);
    if (!bindings.length) continue;
    const byLocal = new Map(bindings.map((b) => [b.local, b]));
    addLocalBindings(file, byLocal, snapshot);

    for (const identifier of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (!byLocal.has(identifier.getText())) continue;
      // Skip the import statement itself; it is reported from the binding list below.
      if (identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) continue;
      // Only the start of a chain: in `a.b`, `b` is handled while walking from `a`.
      const parent = identifier.getParent();
      if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === identifier) continue;
      // The `x` in `const x = ...` is the variable being defined, not a use of the package.
      if (Node.isVariableDeclaration(parent) && parent.getNameNode() === identifier) continue;

      const match = matchChain(snapshot, byLocal, identifier);
      if (!match) continue;
      usages.push(usageAt(match.node, match.path));

      const outer = match.node.getParent();
      const isNew = Node.isNewExpression(outer);
      if ((isNew || Node.isCallExpression(outer)) && outer.getExpression() === match.node) {
        // `new Thing(a, b)` uses the constructor, which may have changed.
        const constructorPath = `${match.path}.constructor`;
        if (isNew && snapshot.has(constructorPath)) usages.push(usageAt(match.node, constructorPath));
        usages.push(...optionUsages(snapshot, outer, isNew ? constructorPath : match.path));
      }
    }

    // Named imports of things that may have been removed, e.g. `import { AxiosPromise } from "axios"`.
    for (const binding of bindings) {
      if (binding.namespace || !snapshot.has(binding.root)) continue;
      const node = file
        .getImportDeclarations()
        .flatMap((d) => d.getNamedImports())
        .find((n) => (n.getAliasNode()?.getText() ?? n.getName()) === binding.local);
      if (node) usages.push(usageAt(node, binding.root));
    }
  }

  return usages;
}
