# Newsletter pitches

JavaScript Weekly and Node Weekly are both edited by Peter Cooper at Cooperpress.
Their websites don't show a submission form. The usual route is:

1. Subscribe (free) at javascriptweekly.com and nodeweekly.com
2. When the next issue arrives, **reply to that email** with the pitch below.
   Replies go to the editors.

Send one pitch per newsletter, not the same email to both at once.
Keep it short. Editors get hundreds of these and decide in seconds.
There is no guarantee of inclusion, and following up more than once is not a good idea.

---

## JavaScript Weekly

**Subject:** bumpscan: see which lines an npm upgrade breaks, before upgrading

```
Hi Peter,

I've built bumpscan, an open-source CLI that shows which lines of your code an
npm upgrade will break, before you upgrade.

  npx bumpscan express@5

It compares the type definitions of both versions, then scans your source for the
places that actually use what changed, with file and line numbers. It also flags
things outside the types, like a package going ESM-only or raising its minimum
Node version.

No AI and no server; it runs locally. There's a GitHub Action that comments on
Dependabot/Renovate PRs, and a --fix flag for renames.

https://github.com/AHMADMALIK1376/bumpscan

Thanks for reading,
Muhammad Ahmad Malik
```

---

## Node Weekly

**Subject:** bumpscan: find what a dependency upgrade breaks in your Node code

```
Hi,

bumpscan is an open-source CLI for the question every dependency upgrade raises:
what does this do to my code?

  npx bumpscan

With no arguments it checks every dependency against its latest version and
lists which ones break the code you actually use. Pointed at one package, it
shows the exact lines, e.g. express 4 → 5 flags req.param() and res.sendfile().

Beyond the types, it catches packages that went ESM-only or now need a newer
Node, which is often what actually breaks a build. Works in npm/yarn/pnpm
workspaces, and ships a GitHub Action for dependency PRs.

https://github.com/AHMADMALIK1376/bumpscan

Thanks,
Muhammad Ahmad Malik
```
