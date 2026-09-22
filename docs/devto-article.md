---
title: I built a tool that tells you which lines an npm upgrade will break
published: false
description: npm outdated says a new version exists. It doesn't say what that version does to your code. bumpscan does, with file and line numbers.
tags: javascript, typescript, node, opensource
cover_image: https://raw.githubusercontent.com/AHMADMALIK1376/bumpscan/main/docs/demo.png
---

Every project I work on has the same quiet backlog: dependency upgrades that nobody wants to start.

Not because upgrading is hard. Because the only honest answer to *"will this break us?"* is *"change the version, run the build, and find out."* The changelog tells you what changed in the library. It doesn't tell you what changed **for your code**.

So I built [bumpscan](https://github.com/AHMADMALIK1376/bumpscan), a CLI that answers that question before you upgrade.

```bash
npx bumpscan express@5
```

```
express  4.22.3 → 5.2.1
   types from @types/express@4.17.25 → @types/express@5.0.6

Breaks your code (3)
  ❌ your whole project  now needs Node 18.0.0 or newer
       💡 fix: check that your CI and servers run Node 18 or newer
  ❌ Request.param  method was removed
       src/server.ts:8:14  const id = req.param("id");
  ❌ Response.sendfile  method was removed
       💡 fix: maybe use sendFile
       src/server.ts:9:3  res.sendfile(`/data/${id}.json`);

3 breaking, 1 risky in 1 of your files · 13 other changes don't touch your code
```

That last line is the whole point. **Most upgrades change a lot and touch you barely at all.** The hard part is finding the few lines that matter.

## How it works

There's no AI and no server. It runs entirely on your machine, in three steps.

**1. Download both versions.** bumpscan reads the version you use today (from `node_modules` or `package.json`), resolves the version you want, and downloads both from npm.

**2. Compare their public API.** It reads each version's type definitions (`.d.ts`) into a flat list: every export, every property, every function signature. Then it compares the two lists and reports what was removed, renamed, made required, or changed shape.

**3. Scan your code.** It parses your source and follows every place you use the package: imports, `require()`, chains like `axios.create().get()`, local variables, constructor calls, and even the parameters of callbacks you pass in. Only changes you actually touch are shown.

It also checks the things that are **not in the types at all**, which is what breaks most builds in practice:

- a package going **ESM-only**, so `require()` stops working
- a package raising its **minimum Node version**

## Three things that surprised me

Getting a first version working was quick. Getting it to stop lying took longer. These three were the interesting ones.

### 1. "Removed" often means "moved"

My first run on axios reported nine breaking changes. When I checked them by hand, several were false. For example, `create` looked removed from `AxiosStatic`, but it had simply moved to a base interface:

```ts
export interface AxiosStatic extends AxiosInstance { … }
export interface AxiosInstance extends Axios {
  create(config?: CreateAxiosDefaults): AxiosInstance;
}
```

Your code still works. Following `extends` removed most of the early false positives. The one change that remained was real, and subtle: `CanceledError`'s constructor went from `(message, code, config, request)` to `(message, config, request)`. The `code` argument was dropped, and the order changed. That's the kind of break I'd never have spotted by reading a changelog.

### 2. `@types/express` is almost empty

Express doesn't ship its own types, so bumpscan reads `@types/express`. My first comparison of express 4 → 5 found **one** change. That was obviously wrong.

It turns out `@types/express` holds almost none of the API itself. Nearly all of it lives in a dependency, `@types/express-serve-static-core`. Before resolving dependencies, the snapshot had 32 entries. After: 498. Then it found the real removals, `req.param()` and `res.sendfile()`.

Matching those in your code needed one more step. In `app.get("/x", (req, res) => …)`, `req` and `res` aren't imports, they're callback parameters. bumpscan reads the handler's type from the function's own signature to work out what they are.

### 3. On a Dependabot PR, you're comparing a version against itself

bumpscan ships as a GitHub Action that comments on dependency pull requests. I tested it on a real PR in its own repo, and the comment said:

> `pacote` 22.0.0 → 22.0.0 — nothing changed

On an upgrade PR, the checked-out `package.json` **already contains the new version**. So "before" and "after" were identical, on every PR, forever. The fix was to read the old version from the PR title (`bump pacote from 21.5.1 to 22.0.0`).

I'd never have found that without running it on a real pull request. Tests with fake data would all have passed.

## More than one package at a time

Run it with no arguments to check every dependency at once. It works in monorepos too (npm, yarn and pnpm workspaces):

```
$ npx bumpscan

🧨 32 dependencies · 520 files scanned

  tinybench     2.9.0 → 6.2.0    ❌ 2 breaking  ⚠️ 3 risky
  execa         9.6.1 → 10.0.1   ❌ 1 breaking
  @biomejs/biome 1.9.4 → 2.5.14  ✅ safe for your code

  21 already up to date
```

And `--fix` rewrites the renames for you. It's deliberately limited: it only touches plain renames, the one kind of change that's always safe to rewrite. Removals need a human decision, and guessing would be worse than doing nothing.

```
$ npx bumpscan chalk@5 --fix

Fixed (2)
  ✏️  src/ui.ts:1  Level → ColorSupportLevel
  ✏️  src/ui.ts:3  Level → ColorSupportLevel
```

## The GitHub Action

Add this to `.github/workflows/bumpscan.yml`, and every Dependabot or Renovate PR gets a comment listing the lines that break:

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
      - uses: AHMADMALIK1376/bumpscan@main
```

## What it can't do

Being upfront about this:

- **TypeScript and JavaScript only.**
- **Packages with no types anywhere** (not shipped, no `@types/*`) only get the package.json checks.
- **Behaviour changes with the same signature are invisible.** If a function keeps its name and arguments but returns something different, bumpscan can't know. It finds the mechanical breakages, not the subtle ones.

## Try it

```bash
npx bumpscan
```

It's MIT-licensed and on [GitHub](https://github.com/AHMADMALIK1376/bumpscan). If it gets something wrong on your project, please open an issue with the package and version. The false positives are the most useful bug reports I can get.
