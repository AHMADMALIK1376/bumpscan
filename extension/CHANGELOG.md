# Changelog

## 0.1.0

First release.

- **Check one dependency upgrade…** — pick a package and version, and the lines that
  break are underlined in your code, with the suggested fix in the tooltip.
- **Check every dependency** — every available upgrade, worst first, and drill into any.
- Breaking changes show as errors, risky ones as warnings, in the Problems panel.
- Whole-project changes (ESM-only, a newer Node version) are shown as a notification.
- Settings for running through `npx` or a global install, and for hiding risky changes.
- Package names and versions are checked before they reach the command line, since
  Windows needs a shell to start `npx` and a name can come from someone else's
  package.json.
