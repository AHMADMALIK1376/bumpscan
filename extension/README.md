# 🧨 bumpscan for VS Code

**See which lines of your code an npm upgrade will break — without leaving the editor.**

Thinking of upgrading express? Run one command and the lines that break are underlined
in red, with the fix in the tooltip.

![bumpscan finding two removed express methods, with file names and line numbers](https://raw.githubusercontent.com/AHMADMALIK1376/bumpscan/main/docs/demo.png)

## Commands

Press `Ctrl+Shift+P` (`Cmd+Shift+P` on a Mac) and type "bumpscan":

| Command | What it does |
|---|---|
| **bumpscan: Check one dependency upgrade…** | Pick a package and a version, then see the lines it breaks |
| **bumpscan: Check every dependency** | Lists every upgrade, worst first, and drills into any of them |
| **bumpscan: Clear results** | Removes the marks from your code |

Breaking changes appear as **red errors**, risky ones as **yellow warnings**, both in the
Problems panel. Changes that affect the whole project — a package going ESM-only, or
needing a newer Node — are shown as a notification, since they belong to no single line.

## What it checks

| Check | Example |
|---|---|
| Removed exports and members | `res.sendfile()` is gone in express 5 |
| Renames | `Level` → `ColorSupportLevel` |
| Options that became required | `config.url` must now be set |
| Wrong number of arguments | `new CanceledError(a, b, c, d)` no longer fits |
| Type changes | `number` → `Milliseconds` |
| ESM-only packages | `require("chalk")` stops working |
| Higher minimum Node version | now needs Node 18+ |

Packages that ship no types of their own are read from `@types/*`, so express, lodash
and friends work too.

## Requirements

Node.js on your machine. The extension runs the [bumpscan](https://www.npmjs.com/package/bumpscan)
CLI through `npx`, which fetches it the first time and caches it after that.

If you'd rather use a copy you installed yourself (`npm i -g bumpscan`), set
**bumpscan › Runner** to `global` in Settings.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `bumpscan.runner` | `npx` | Run through `npx`, or a globally installed `bumpscan` |
| `bumpscan.includeRisky` | `true` | Also mark changes that *might* break your code |

## Privacy

No AI, no account, no telemetry. The extension runs the CLI on your own machine; the
only network use is npm, to download the two versions being compared.

## Develop

```bash
npm install
npm run build
npm test          # the pure logic, no editor needed
npm run package   # builds a .vsix
```

To drive the extension inside a real VS Code window and check the marks it draws:

```bash
code --extensionDevelopmentPath=. --extensionTestsPath=./test-vscode/suite.cjs ../../bumpscan-demo
```

## Links

- [Source and issues](https://github.com/AHMADMALIK1376/bumpscan)
- [CLI on npm](https://www.npmjs.com/package/bumpscan)

MIT © Muhammad Ahmad Malik
