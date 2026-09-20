import { readFile, writeFile } from "node:fs/promises";
import type { Hit } from "../index.js";

export interface FileEdit {
  file: string;
  line: number;
  from: string;
  to: string;
}

export interface FixResult {
  edits: FileEdit[];
  /** Changes that need a human, e.g. a removal with no replacement. */
  skipped: Hit[];
}

interface Replacement {
  start: number;
  end: number;
  to: string;
  line: number;
  from: string;
}

/**
 * Applies the renames we are sure about. Everything else is reported as skipped:
 * a removal or a type change needs a decision, and guessing would be worse than nothing.
 */
export async function applyFixes(hits: Hit[], options: { dryRun?: boolean } = {}): Promise<FixResult> {
  const byFile = new Map<string, Replacement[]>();
  const skipped: Hit[] = [];

  for (const hit of hits) {
    const to = hit.change.renamedTo;
    const renameable = to ? hit.usages.filter((usage) => usage.nameRange) : [];

    if (!to || !renameable.length) {
      if (hit.change.severity === "breaking") skipped.push(hit);
      continue;
    }

    for (const usage of renameable) {
      const [start, end] = usage.nameRange!;
      const from = hit.change.path.slice(hit.change.path.lastIndexOf(".") + 1);
      byFile.set(usage.file, [...(byFile.get(usage.file) ?? []), { start, end, to, line: usage.line, from }]);
    }
  }

  const edits: FileEdit[] = [];
  for (const [file, replacements] of byFile) {
    const raw = await readFile(file, "utf8");
    // TypeScript drops a leading byte-order mark, so offsets are counted without it.
    const bom = raw.startsWith("﻿") ? "﻿" : "";
    const text = raw.slice(bom.length);
    // Back to front, so earlier offsets stay valid.
    const ordered = [...replacements].sort((a, b) => b.start - a.start);

    let updated = text;
    for (const replacement of ordered) {
      // Only rewrite when the text is still what we matched, so a stale scan cannot corrupt a file.
      if (updated.slice(replacement.start, replacement.end) !== replacement.from) continue;
      updated = updated.slice(0, replacement.start) + replacement.to + updated.slice(replacement.end);
      edits.push({ file, line: replacement.line, from: replacement.from, to: replacement.to });
    }

    if (updated !== text && !options.dryRun) await writeFile(file, bom + updated);
  }

  return { edits, skipped };
}
