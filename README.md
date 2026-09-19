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

> ⚠️ Early work in progress. Today bumpscan finds and downloads both versions.
> Comparing them and scanning your code are being built now.

## How it works

1. Finds the version you use now (from `node_modules` or `package.json`).
2. Downloads the old and new versions from npm.
3. Compares their type files (`.d.ts`) to find what was removed, renamed or changed.
4. Scans your code for every place that uses those things.
5. Prints the file, the line and the fix.

No AI, no server, no account. Everything runs on your machine.

## Roadmap

- [x] Find the current version and download both versions
- [ ] Compare the public API of the two versions
- [ ] Find affected lines in your code
- [ ] Colored report with fixes
- [ ] GitHub Action that comments on Dependabot / Renovate PRs

## Develop

```bash
npm install
npm run build
node dist/cli.js axios@latest --cwd path/to/a/project
npm test
```

## License

MIT © Muhammad Ahmad Malik
