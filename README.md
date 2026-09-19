# 🧨 bumpscan

**See exactly which lines of your code an npm upgrade will break — before you upgrade.**

```bash
npx bumpscan axios@2
```

```
🧨 axios  1.7.9 → 2.0.0

❌ src/api/user.ts:14   "timeout" option was renamed
❌ src/api/auth.ts:32   axios.defaults.headers was removed
✅ 21 other uses are safe
```

> ⚠️ Early work in progress. Today bumpscan lists everything that changed between the
> two versions. Showing only the lines *your* code uses is being built now.

Real output today:

```
🧨 chalk  4.1.2 → 5.6.2

Breaking (6)
  ❌ (package)  is now ESM-only: require() stops working
  ❌ (package)  now needs Node 12.17.0 or newer (was 10.0.0)
  ❌ Chalk  was an interface, is now a variable
  ❌ ChalkFunction  interface was removed
  ❌ Instance  type was removed
  ❌ Level  renamed to ColorSupportLevel
```

## What it checks

| Check | Example |
|---|---|
| Removed exports and members | `Option.optionFlags` is gone |
| Renames | `Level` → `ColorSupportLevel` |
| Options that became required | `config.url` must now be set |
| Functions that need more / accept fewer arguments | `new CanceledError(msg, code, config, req)` no longer fits |
| Type changes | `string` → `string \| number` |
| Switch to ESM-only | `require("chalk")` stops working |
| Higher minimum Node version | now needs Node 18+ |

## How it works

1. Finds the version you use now (from `node_modules` or `package.json`).
2. Downloads the old and new versions from npm.
3. Compares their type files (`.d.ts`) to find what was removed, renamed or changed.
4. Scans your code for every place that uses those things.
5. Prints the file, the line and the fix.

No AI, no server, no account. Everything runs on your machine.

## Roadmap

- [x] Find the current version and download both versions
- [x] Compare the public API of the two versions
- [x] Compare package.json (ESM-only, Node version)
- [ ] Find affected lines in your code
- [ ] Read types from `@types/*` for packages that don't ship their own
- [ ] Colored report with fixes
- [ ] GitHub Action that comments on Dependabot / Renovate PRs

## Develop

```bash
npm install
npm run build
node dist/cli.js axios@latest --cwd path/to/a/project
node dist/cli.js axios@latest --all     # list every change
node dist/cli.js axios@latest --json    # machine-readable output
npm test
```

## License

MIT © Muhammad Ahmad Malik
