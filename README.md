# 🧨 bumpscan

**See exactly which lines of your code an npm upgrade will break — before you upgrade.**

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

## Roadmap

- [x] Find the current version and download both versions
- [x] Compare the public API of the two versions
- [x] Compare package.json (ESM-only, Node version)
- [x] Find affected lines in your code, through imports, `require`, chains and local variables
- [x] Read types from `@types/*` for packages that don't ship their own
- [x] Suggest the fix for each break
- [x] Scan every dependency at once
- [ ] Colored report with fixes
- [ ] GitHub Action that comments on Dependabot / Renovate PRs

## Develop

```bash
npm install
npm run build
node dist/cli.js axios@latest --cwd path/to/a/project
node dist/cli.js axios@latest --all     # don't fold long lists
node dist/cli.js axios@latest --json    # machine-readable output
node dist/cli.js axios@latest --ci      # exit code 1 when your code breaks
npm test
```

## License

MIT © Muhammad Ahmad Malik
