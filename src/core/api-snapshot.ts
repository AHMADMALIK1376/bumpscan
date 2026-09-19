import { Node, Project, type ParameterDeclaration, type TypeNode } from "ts-morph";

/**
 * A flat list of everything a package makes public, keyed by path:
 * `AxiosRequestConfig` for an export, `AxiosRequestConfig.timeout` for one of its members.
 */
export type ApiSnapshot = Map<string, ApiEntry>;

export type EntryKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "variable"
  | "enum"
  | "namespace"
  | "property"
  | "method"
  | "constructor"
  | "enum-member";

export interface Param {
  name: string;
  type: string;
  optional: boolean;
  rest: boolean;
}

export interface Signature {
  params: Param[];
  returns: string;
}

export interface ApiEntry {
  path: string;
  name: string;
  /** Path of the export this is a member of. */
  parent?: string;
  kind: EntryKind;
  /** The type as written in the `.d.ts` file. */
  type?: string;
  optional?: boolean;
  signatures?: Signature[];
}

/** Type text as written, with spacing and separators normalised so formatting changes don't count. */
function typeText(node: TypeNode | Node | undefined): string {
  if (!node) return "any";
  return node
    .getText()
    .replace(/\s+/g, " ")
    .replace(/\s*[;,]\s*}/g, " }")
    .replace(/;\s*/g, ", ")
    .trim();
}

type SignatureLike = Node & {
  getParameters(): ParameterDeclaration[];
  getReturnTypeNode(): TypeNode | undefined;
};

function signature(node: SignatureLike): Signature {
  return {
    params: node
      .getParameters()
      // `this: X` only says what `this` is inside; callers never pass it.
      .filter((p) => p.getName() !== "this")
      .map((p) => ({
      name: p.getName(),
      type: typeText(p.getTypeNode()),
      optional: p.isOptional(),
      rest: p.isRestParameter(),
    })),
    returns: typeText(node.getReturnTypeNode()),
  };
}

class Collector {
  readonly entries: ApiSnapshot = new Map();
  private readonly seen = new Set<Node>();

  /** Declaration merging (overloads, `function x` + `namespace x`) lands on one path. */
  private add(entry: ApiEntry) {
    const existing = this.entries.get(entry.path);
    if (!existing) {
      this.entries.set(entry.path, entry);
      return;
    }
    if (entry.signatures) existing.signatures = [...(existing.signatures ?? []), ...entry.signatures];
  }

  declaration(decl: Node, name: string, parent?: string) {
    if (this.seen.has(decl)) return;
    this.seen.add(decl);
    const path = parent ? `${parent}.${name}` : name;
    const base = { path, name, parent };

    if (Node.isFunctionDeclaration(decl)) {
      this.add({ ...base, kind: "function", signatures: [signature(decl)] });
    } else if (Node.isClassDeclaration(decl)) {
      this.add({ ...base, kind: "class" });
      this.members(decl.getMembers(), path);
      this.inherited(decl, path);
    } else if (Node.isInterfaceDeclaration(decl)) {
      this.add({ ...base, kind: "interface" });
      this.members(decl.getMembers(), path);
      this.inherited(decl, path);
    } else if (Node.isTypeAliasDeclaration(decl)) {
      const typeNode = decl.getTypeNode();
      if (Node.isTypeLiteral(typeNode)) {
        this.add({ ...base, kind: "type" });
        this.members(typeNode.getMembers(), path);
      } else {
        this.add({ ...base, kind: "type", type: typeText(typeNode) });
      }
    } else if (Node.isEnumDeclaration(decl)) {
      this.add({ ...base, kind: "enum" });
      for (const member of decl.getMembers()) {
        this.add({
          path: `${path}.${member.getName()}`,
          name: member.getName(),
          parent: path,
          kind: "enum-member",
          type: typeText(member.getInitializer()),
        });
      }
    } else if (Node.isVariableDeclaration(decl)) {
      const typeNode = decl.getTypeNode();
      if (Node.isTypeLiteral(typeNode)) {
        this.add({ ...base, kind: "variable" });
        this.members(typeNode.getMembers(), path);
      } else {
        this.add({ ...base, kind: "variable", type: typeText(typeNode) });
      }
    } else if (Node.isModuleDeclaration(decl) || Node.isSourceFile(decl)) {
      // `namespace x {}` or `export * as x from "./x"`
      this.add({ ...base, kind: "namespace" });
      this.exports(decl.getExportedDeclarations(), path);
    } else if (Node.isExpression(decl)) {
      // `export default someExpression`
      this.add({ ...base, kind: "variable", type: decl.getType().getText(decl) });
    }
  }

  exports(exported: ReadonlyMap<string, Node[]>, parent?: string) {
    for (const [name, decls] of exported) {
      for (const decl of decls) this.declaration(decl, name, parent);
    }
  }

  /**
   * Members that come from `extends`. A member that moved to a base type is still there
   * for users, so it must not look removed. Own members win over inherited ones.
   */
  private inherited(decl: Node, path: string, visited = new Set<Node>([decl])) {
    const bases: Node[] = Node.isInterfaceDeclaration(decl)
      ? decl.getBaseDeclarations()
      : Node.isClassDeclaration(decl)
        ? [decl.getBaseClass()].filter((b): b is NonNullable<typeof b> => !!b)
        : [];

    for (const baseDecl of bases) {
      if (visited.has(baseDecl)) continue;
      visited.add(baseDecl);
      if (!Node.isInterfaceDeclaration(baseDecl) && !Node.isClassDeclaration(baseDecl)) continue;
      // Built-in types (Promise, Array, Error…) live in TypeScript's own lib files. Their
      // members are not the package's API, and reporting them only adds noise.
      if (baseDecl.getSourceFile().isInNodeModules()) continue;

      const own = new Collector();
      own.members(baseDecl.getMembers(), path);
      for (const [memberPath, entry] of own.entries) {
        if (!this.entries.has(memberPath)) this.entries.set(memberPath, entry);
      }
      this.inherited(baseDecl, path, visited);
    }
  }

  private members(members: Node[], parent: string) {
    for (const member of members) {
      // Private members (`private x`, `#x`) aren't part of the public API.
      if (Node.isModifierable(member) && member.hasModifier("private")) continue;
      if (Node.hasName(member) && member.getName().startsWith("#")) continue;

      const at = (name: string) => ({ path: `${parent}.${name}`, name, parent });

      if (Node.isPropertySignature(member) || Node.isPropertyDeclaration(member)) {
        this.add({
          ...at(member.getName()),
          kind: "property",
          type: typeText(member.getTypeNode()),
          optional: member.hasQuestionToken(),
        });
      } else if (Node.isGetAccessorDeclaration(member)) {
        this.add({ ...at(member.getName()), kind: "property", type: typeText(member.getReturnTypeNode()) });
      } else if (Node.isMethodSignature(member) || Node.isMethodDeclaration(member)) {
        this.add({
          ...at(member.getName()),
          kind: "method",
          optional: member.hasQuestionToken(),
          signatures: [signature(member)],
        });
      } else if (Node.isConstructorDeclaration(member) || Node.isConstructSignatureDeclaration(member)) {
        this.add({ ...at("constructor"), kind: "constructor", signatures: [signature(member)] });
      } else if (Node.isCallSignatureDeclaration(member)) {
        this.add({ ...at("(call)"), kind: "method", signatures: [signature(member)] });
      }
    }
  }
}

function newProject(inMemory = false) {
  return new Project({
    useInMemoryFileSystem: inMemory,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { skipLibCheck: true, noEmit: true },
  });
}

/** Reads a package's entry `.d.ts` file (and every file it imports) into a snapshot. */
export function snapshotApi(typesFile: string): ApiSnapshot {
  const project = newProject();
  const source = project.addSourceFileAtPath(typesFile);
  project.resolveSourceFileDependencies();

  const collector = new Collector();
  collector.exports(source.getExportedDeclarations());
  return collector.entries;
}

/** Same as {@link snapshotApi}, from source text. Handy for tests. */
export function snapshotSource(code: string): ApiSnapshot {
  const source = newProject(true).createSourceFile("/index.d.ts", code);
  const collector = new Collector();
  collector.exports(source.getExportedDeclarations());
  return collector.entries;
}
