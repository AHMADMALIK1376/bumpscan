/** What the user asked to upgrade to, e.g. `axios@2` or `@tanstack/react-query@^5`. */
export interface Target {
  name: string;
  /** A version or range. `latest` when the user gave none. */
  range: string;
}

export function parseTarget(input: string): Target {
  const text = input.trim();
  if (!text) throw new Error("Give a package to check, like: bumpscan axios@2");

  // Scoped names start with "@", so the version separator is the *last* "@" after position 0.
  const at = text.lastIndexOf("@");
  if (at <= 0) return { name: text, range: "latest" };

  const name = text.slice(0, at);
  const range = text.slice(at + 1) || "latest";
  return { name, range };
}
