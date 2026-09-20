import type { ApiEntry, ApiSnapshot, Signature } from "./api-snapshot.js";


/** breaking: code that used this will stop compiling. maybe: it might. safe: nothing to do. */
export type Severity = "breaking" | "maybe" | "safe";

export interface ApiChange {
  path: string;
  kind: "removed" | "added" | "changed" | "renamed";
  severity: Severity;
  message: string;
  before?: string;
  after?: string;
  /** What to do about it, when we can work it out. */
  fix?: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { breaking: 0, maybe: 1, safe: 2 };

/** Kinds whose members users build themselves, e.g. an options object passed to a function. */
const SHAPE_KINDS = new Set(["interface", "type"]);

/** Kind changes that rarely break code that only uses the thing. */
const SIMILAR_KINDS = [
  // Values you call or read members of: `x()` and `x.y` look the same either way.
  new Set(["method", "property", "function", "variable", "namespace"]),
  // Types you only name: `let a: X` works for both.
  new Set(["interface", "type"]),
];

const article = (word: string) => `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;

export function formatSignature(sig: Signature, withNames = true): string {
  const params = sig.params.map((p) => {
    const name = withNames ? `${p.rest ? "..." : ""}${p.name}${p.optional ? "?" : ""}: ` : p.optional ? "?" : "";
    return `${name}${p.type}`;
  });
  return `(${params.join(", ")}) => ${sig.returns}`;
}

/** What an entry looks like, ignoring its name. Two entries with the same fingerprint are likely a rename. */
function fingerprint(entry: ApiEntry, snapshot: ApiSnapshot): string {
  const children = [...snapshot.values()]
    .filter((e) => e.parent === entry.path)
    .map((e) => e.name)
    .sort()
    .join(",");
  const signatures = entry.signatures?.map((s) => formatSignature(s, false)).join("|") ?? "";
  return [entry.kind, entry.type ?? "", entry.optional ? "?" : "", signatures, children].join("#");
}

/** How many single-character edits turn `a` into `b`. Used to spot near-miss names. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous = row;
  }
  return previous[b.length]!;
}

/** For something that disappeared: did it move, or is there a close new name? */
function suggestForRemoved(entry: ApiEntry, after: ApiSnapshot): string | undefined {
  const sameName = [...after.values()].filter((e) => e.name === entry.name && e.path !== entry.path);
  if (sameName.length === 1) return `moved to ${sameName[0]!.path}`;

  const lower = entry.name.toLowerCase();
  const siblings = [...after.values()].filter((e) => e.parent === entry.parent && e.kind === entry.kind);
  const close = siblings
    .map((e) => ({ name: e.name, distance: editDistance(lower, e.name.toLowerCase()) }))
    .filter((e) => {
      const other = e.name.toLowerCase();
      return e.distance <= 2 || other.includes(lower) || lower.includes(other);
    })
    .sort((a, b) => a.distance - b.distance);

  return close.length ? `maybe use ${close[0]!.name}` : undefined;
}

function argumentRange(sig: Signature): [min: number, max: number] {
  const min = sig.params.filter((p) => !p.optional && !p.rest).length;
  const max = sig.params.some((p) => p.rest) ? Infinity : sig.params.length;
  return [min, max];
}

/** Finds an argument count that worked before and no longer does. */
function brokenArity(before: Signature[], after: Signature[]): string | undefined {
  const accepts = (n: number) =>
    after.some((sig) => {
      const [min, max] = argumentRange(sig);
      return n >= min && n <= max;
    });

  for (const sig of before) {
    const [min, max] = argumentRange(sig);
    const last = Number.isFinite(max) ? max : min + 3;
    for (let n = min; n <= last; n++) {
      if (accepts(n)) continue;
      const newMin = Math.min(...after.map((s) => argumentRange(s)[0]));
      return n < newMin
        ? `now needs at least ${newMin} argument${newMin === 1 ? "" : "s"}, was ${n}`
        : `no longer accepts ${n} argument${n === 1 ? "" : "s"}`;
    }
  }
  return undefined;
}

function compareEntry(before: ApiEntry, after: ApiEntry, parentKind: string | undefined): ApiChange | undefined {
  const path = before.path;

  if (before.kind !== after.kind) {
    // Most code uses these pairs the same way (you call a method or a function-typed property alike).
    const similar = SIMILAR_KINDS.some((pair) => pair.has(before.kind) && pair.has(after.kind));
    return {
      path,
      kind: "changed",
      severity: similar ? "maybe" : "breaking",
      message: `was ${article(before.kind)}, is now ${article(after.kind)}`,
      fix: similar ? undefined : `${before.path} is used differently now: check the changelog`,
    };
  }

  if (before.optional && !after.optional && parentKind && SHAPE_KINDS.has(parentKind)) {
    return {
      path,
      kind: "changed",
      severity: "breaking",
      message: "is now required",
      fix: `always pass ${before.name}`,
    };
  }

  if (before.signatures && after.signatures) {
    const arity = brokenArity(before.signatures, after.signatures);
    // A call signature is usually a callback type users *write*, not call, and a
    // function taking fewer arguments still fits. So only a risk there.
    if (arity) {
      const shape = after.signatures.map((s) => formatSignature(s)).join(" | ");
      return {
        path,
        kind: "changed",
        severity: before.name === "(call)" ? "maybe" : "breaking",
        message: arity,
        fix: `call it as ${shape}`,
      };
    }

    const show = (sigs: Signature[]) => sigs.map((s) => formatSignature(s)).join(" | ");
    const bare = (sigs: Signature[]) => sigs.map((s) => formatSignature(s, false)).join(" | ");
    if (bare(before.signatures) !== bare(after.signatures)) {
      return {
        path,
        kind: "changed",
        severity: "maybe",
        message: "parameter or return types changed",
        before: show(before.signatures),
        after: show(after.signatures),
      };
    }
  }

  if (before.type !== after.type) {
    return {
      path,
      kind: "changed",
      severity: "maybe",
      message: "type changed",
      before: before.type,
      after: after.type,
      fix: `make sure your value still fits ${after.type}`,
    };
  }
  return undefined;
}

/** Lists everything that differs between two snapshots, most dangerous first. */
export function compareApi(before: ApiSnapshot, after: ApiSnapshot): ApiChange[] {
  const changes: ApiChange[] = [];

  // A removed export takes its members with it; report the export once, not every member.
  // Same when the export changed kind (e.g. an interface that became a variable): the
  // export's own "was an interface, is now a variable" already says it.
  const topmost = (from: ApiSnapshot, other: ApiSnapshot) =>
    [...from.values()].filter((e) => {
      if (other.has(e.path)) return false;
      if (!e.parent) return true;
      const otherParent = other.get(e.parent);
      return !!otherParent && otherParent.kind === from.get(e.parent)?.kind;
    });
  const removed = topmost(before, after);
  const added = topmost(after, before);

  // Pair a removed entry with an added one that looks exactly the same: that's a rename.
  const renamedTo = new Map<ApiEntry, ApiEntry>();
  const usedAdded = new Set<ApiEntry>();
  const addedByPrint = new Map<string, ApiEntry[]>();
  for (const entry of added) {
    const key = `${entry.parent ?? ""}@${fingerprint(entry, after)}`;
    addedByPrint.set(key, [...(addedByPrint.get(key) ?? []), entry]);
  }
  const removedByPrint = new Map<string, number>();
  for (const entry of removed) {
    const key = `${entry.parent ?? ""}@${fingerprint(entry, before)}`;
    removedByPrint.set(key, (removedByPrint.get(key) ?? 0) + 1);
  }
  for (const entry of removed) {
    const key = `${entry.parent ?? ""}@${fingerprint(entry, before)}`;
    const candidates = addedByPrint.get(key) ?? [];
    if (candidates.length === 1 && removedByPrint.get(key) === 1) {
      renamedTo.set(entry, candidates[0]!);
      usedAdded.add(candidates[0]!);
    }
  }

  for (const entry of removed) {
    const target = renamedTo.get(entry);
    changes.push(
      target
        ? {
            path: entry.path,
            kind: "renamed",
            severity: "breaking",
            message: `renamed to ${target.name}`,
            fix: `rename ${entry.name} to ${target.name}`,
          }
        : {
            path: entry.path,
            kind: "removed",
            severity: "breaking",
            message: `${entry.kind} was removed`,
            fix: suggestForRemoved(entry, after),
          },
    );
  }

  for (const entry of added) {
    if (usedAdded.has(entry)) continue;
    const parentKind = entry.parent ? after.get(entry.parent)?.kind : undefined;
    const required = entry.kind === "property" && !entry.optional && parentKind && SHAPE_KINDS.has(parentKind);
    changes.push({
      path: entry.path,
      kind: "added",
      severity: required ? "maybe" : "safe",
      message: required ? "new required property (objects you build may need it)" : `new ${entry.kind}`,
    });
  }

  for (const [path, entry] of before) {
    const next = after.get(path);
    if (!next) continue;
    const parentKind = entry.parent ? before.get(entry.parent)?.kind : undefined;
    const change = compareEntry(entry, next, parentKind);
    if (change) changes.push(change);
  }

  return changes.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.path.localeCompare(b.path),
  );
}
