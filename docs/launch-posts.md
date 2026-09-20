# Launch posts

Copy, paste, post. Don't post everywhere at once — Hacker News first, in the morning
US time (roughly 6–9pm Pakistan time) on a Tuesday, Wednesday or Thursday.

---

## 1. Hacker News (post this first)

**Title** (must start with "Show HN", keep it under 80 characters):

```
Show HN: Bumpscan – See which lines of your code an npm upgrade will break
```

**URL:** `https://github.com/AHMADMALIK1376/bumpscan`

**First comment** (post this yourself right after submitting):

```
I kept putting off dependency upgrades because the only honest answer to "will this
break us?" was "run it and find out". Changelogs say what changed in the library;
they don't say what changed for *my* code.

Bumpscan downloads both versions of a package, compares their type definitions, then
scans your source for the places that actually use what changed:

  $ npx bumpscan express@5

  Breaks your code (3)
    x your whole project  now needs Node 18.0.0 or newer
    x Request.param  method was removed
         src/server.ts:8:14  const id = req.param("id");
    x Response.sendfile  method was removed
         fix: maybe use sendFile
         src/server.ts:9:3  res.sendfile(`/data/${id}.json`);

  3 breaking, 1 risky in 1 of your files - 13 other changes don't touch your code

That last line is the point. Most upgrades change a lot and touch you barely at all.

No AI and no server: it is type comparison plus a scan of your code, so it runs
entirely on your machine and there is nothing to sign up for. It also checks the
things that are not in the types at all, like a package going ESM-only or raising
its minimum Node version, which is what actually breaks most builds.

Some things I learned building it:

- A member that "disappeared" has often just moved to a base interface. Following
  extends removed most of my early false positives.
- Express keeps almost none of its API in @types/express; it is nearly all in
  @types/express-serve-static-core. Before I resolved dependencies, express 4 -> 5
  looked like it had one change. It has hundreds.
- On a Dependabot PR the checked-out package.json already contains the new version,
  so my GitHub Action compared a version against itself and found nothing. I only
  caught that by running it on a real PR.

Limits, up front: TypeScript and JavaScript only, packages with no types at all get
the package.json checks only, and it cannot see behaviour changes where the signature
stays the same. It finds the mechanical breakages, not the subtle ones.

Repo: https://github.com/AHMADMALIK1376/bumpscan
```

---

## 2. X / Twitter

Attach `docs/demo.png` (X does not display SVG).

```
npm outdated tells you a new version exists.

It doesn't tell you what that version does to YOUR code.

npx bumpscan express@5

→ Request.param was removed — src/server.ts:8
→ Response.sendfile was removed — src/server.ts:9
→ 13 other changes don't touch your code

No AI. No server. Free.
```

Reply to your own tweet with the link:

```
Open source, MIT: github.com/AHMADMALIK1376/bumpscan

Also works as a GitHub Action that comments on your Dependabot PRs with the exact
lines that break.
```

---

## 3. Reddit

**Subreddits:** r/javascript (Showoff Saturday), r/node, r/typescript
Check each subreddit's rules first; some only allow self-promotion on certain days.

**Title:**

```
I built a tool that shows which lines of your code an npm upgrade will break
```

**Body:**

```
Upgrading a dependency always came down to "change the version, run the build, see
what explodes". Changelogs tell you what changed in the library, not what changed
for your code.

bumpscan compares the type definitions of both versions and then scans your source
for the places that use what changed:

    npx bumpscan express@5

    Breaks your code (3)
      x your whole project  now needs Node 18.0.0 or newer
      x Request.param  method was removed
           src/server.ts:8:14  const id = req.param("id");
      x Response.sendfile  method was removed
           fix: maybe use sendFile
           src/server.ts:9:3  res.sendfile(`/data/${id}.json`);

    3 breaking, 1 risky in 1 of your files - 13 other changes don't touch your code

`npx bumpscan` with no arguments checks every dependency at once. It also catches
the things that live outside the types, like a package going ESM-only or requiring
a newer Node, and there is a GitHub Action that comments on Dependabot PRs.

No AI, no server, no account. MIT licensed.

https://github.com/AHMADMALIK1376/bumpscan

Honest limits: TypeScript/JavaScript only, packages that ship no types at all get
the package.json checks only, and it can't see behaviour changes that keep the same
signature.
```

---

## 4. LinkedIn

```
I published my first open-source developer tool.

Every developer knows the feeling: a dependency update is available, and nobody
wants to be the one to run it.

bumpscan answers the real question — not "what changed in this library?" but
"what changed for my code?" It compares the two versions' type definitions and
points at the exact files and lines you need to touch.

npx bumpscan

It runs entirely on your machine. No AI, no server, no account. MIT licensed.

github.com/AHMADMALIK1376/bumpscan

Feedback welcome, especially from anyone who has been putting off an upgrade.
```

---

## Launch-day checklist

- [ ] Post on Hacker News in the morning, US time
- [ ] Add your first comment straight away
- [ ] **Stay available for 2–3 hours** and answer every reply, quickly and plainly
- [ ] Post on X, then reply to yourself with the link
- [ ] Post on Reddit the next day, not the same day
- [ ] Never ask for upvotes or stars; it backfires
- [ ] If someone reports a bug, fix it that day and say so in the thread

## If it gets no attention

That is normal, and it is not a verdict on the tool. Most posts get missed.
Wait a couple of weeks, add a feature worth talking about, and post again with a
different angle.
