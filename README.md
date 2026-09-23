# 🧨 bumpscan

[![npm](https://img.shields.io/npm/v/bumpscan?color=red)](https://www.npmjs.com/package/bumpscan)
[![CI](https://github.com/AHMADMALIK1376/bumpscan/actions/workflows/ci.yml/badge.svg)](https://github.com/AHMADMALIK1376/bumpscan/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/bumpscan)](./LICENSE)

**See exactly which lines of your code an npm upgrade will break — before you upgrade.**

No AI, no server, no account. One command.

<img src="https://raw.githubusercontent.com/AHMADMALIK1376/bumpscan/main/docs/demo.svg" alt="bumpscan finding two removed express methods in a project, with file names and line numbers" width="760">

<sub>Real output. `npm outdated` tells you a new version exists; bumpscan tells you what it does to *your* code.</sub>

```bash
npx bumpscan            # check every dependency
npx bumpscan axios@2    # check one upgrade in detail
```

```
🧨 32 dependencies · 520 files scanned

  tinybench     2.9.0 → 6.2.0    ❌ 2 breaking  ⚠️ 3 risky
  execa         9.6.1 → 10.0.1   ❌ 1 breaking
  chalk         5.6.2 → 6.0.0    ❌ 1 breaking
  @biomejs/biome 1.9.4 → 2.5.14  ✅ safe for your code

  21 already up to date
```

```
🧨 axios  1.7.9 → 2.0.0

❌ src/api/user.ts:14   "timeout" option was renamed
❌ src/api/auth.ts:32   axios.defaults.headers was removed
✅ 21 other uses are safe
```

> ⚠️ Early work in progress, but the main idea works today.

Real output, scanning a small project against the real axios upgrade:

```
🧨 axios  0.27.2 → 1.20.0

Breaks your code (1)
  ❌ CanceledError.constructor  no longer accepts 4 arguments
       src/api.ts:10:13  throw new CanceledError(reason, "ERR_CANCELED", {} as Axi…

Might break your code (5)
  ⚠️  AxiosRequestConfig.timeout  type changed
       before: number
       after:  Milliseconds
       src/api.ts:3:67  const client = axios.create({ baseURL: "…", timeout: 5000 })
       src/api.ts:6:39  return client.get(`/users/${id}`, { timeout: 2000 });

1 breaking, 5 risky in 1 of your files · 172 other changes don't touch your code
```

The last line is the point: **172 changes, 6 that matter to you.**

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

Packages without their own types are read from `@types/*`, so express, lodash and
friends work too:

```
🧨 express  4.22.3 → 5.2.1
   types from @types/express@4.17.25 → @types/express@5.0.6

Breaks your code (3)
  ❌ your whole project  now needs Node 18.0.0 or newer (was 0.10.0)
  ❌ Request.param  method was removed
       src/server.ts:6:14  const id = req.param("id");
  ❌ Response.sendfile  method was removed
       💡 fix: maybe use sendFile
       src/server.ts:7:3  res.sendfile(`/data/${id}.json`);
```

## How it works

1. Finds the version you use now (from `node_modules` or `package.json`).
2. Downloads the old and new versions from npm.
3. Compares their type files (`.d.ts`) to find what was removed, renamed or changed.
4. Scans your code for every place that uses those things.
5. Prints the file, the line and the fix.

No AI, no server, no account. Everything runs on your machine.

## Fixing the easy ones

`--fix` rewrites the renames, which are the only changes that are always safe to
rewrite. Everything else is listed for you to decide:

```
$ npx bumpscan chalk@5 --fix

Fixed (2)
  ✏️  src/ui.ts:1  Level → ColorSupportLevel
  ✏️  src/ui.ts:3  Level → ColorSupportLevel

2 breaking changes still need you:
  • your whole project  is now ESM-only: require() stops working
  • your whole project  now needs Node 12.17.0 or newer
```

It never edits a line whose text has changed since the scan, so a stale run cannot
corrupt a file. Check the result with `git diff` before committing.

## Monorepos

Run it at the root. Dependencies are collected from every workspace package
(npm, yarn or pnpm), listed once, and matched against code anywhere in the repo.
`workspace:*` links are skipped, since they are not on npm.

## GitHub Action

Comment on every Dependabot or Renovate pull request with the lines of your code
that break. Create `.github/workflows/bumpscan.yml`:

```yaml
name: bumpscan
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: AHMADMALIK1376/bumpscan@v0.1.2
        # with:
        #   fail-on-breaking: "true"   # block the merge instead of just commenting
```

It reads the package from the pull request title (`bump axios from 0.27.2 to 1.20.0`),
posts one comment and updates that same comment on later pushes.

The comment looks like this (a real one, from this repo's own [#1](https://github.com/AHMADMALIK1376/bumpscan/pull/1)):

> ### 🧨 bumpscan · `pacote` 21.5.1 → 22.0.0
>
> #### ❌ Breaks your code (1)
>
> | What | Change | Where |
> | --- | --- | --- |
> | whole project | now needs Node 22.22.2 or newer (was 20.17.0) — check that your CI and servers run Node 22 or newer | — |
>
> <sub>0 other changes don't touch your code · 27 files scanned</sub>

On a pull request the checked-out `package.json` already holds the new version, so the
old one is read from the title. `--from` sets it by hand.

## Roadmap

- [x] Find the current version and download both versions
- [x] Compare the public API of the two versions
- [x] Compare package.json (ESM-only, Node version)
- [x] Find affected lines in your code, through imports, `require`, chains and local variables
- [x] Read types from `@types/*` for packages that don't ship their own
- [x] Suggest the fix for each break
- [x] Scan every dependency at once
- [ ] Colored report with fixes
- [x] GitHub Action that comments on Dependabot / Renovate PRs
- [x] Monorepo support (npm, yarn and pnpm workspaces)
- [x] `--fix` that renames things in your code for you
- [ ] VS Code extension
- [ ] Website

## Develop

```bash
npm install
npm run build
node dist/cli.js axios@latest --cwd path/to/a/project
node dist/cli.js axios@latest --all     # don't fold long lists
node dist/cli.js axios@latest --json    # machine-readable output
node dist/cli.js axios@latest --ci      # exit code 1 when your code breaks
node dist/cli.js chalk@5 --fix          # rewrite the renames in your code
npm test
```

## License

MIT © Muhammad Ahmad Malik
