#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import ora from "ora";
import pc from "picocolors";
import { compareUpgrade, prepareUpgrade, scanProject, type Hit } from "./index.js";

/** How many hits of each group to show before folding the rest (unless --all). */
const BREAKING_LIMIT = 25;
const MAYBE_LIMIT = 15;

const program = new Command();

function short(text: string | undefined, max = 70) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function printHit(hit: Hit, cwd: string, icon: string, color: (s: string) => string) {
  const { change, usages } = hit;
  const title = change.path === "(package)" ? "your whole project" : change.path;
  console.log(`  ${icon} ${color(title)}  ${pc.dim(change.message)}`);

  if (change.before !== undefined && change.after !== undefined) {
    console.log(pc.dim(`       before: ${short(change.before)}`));
    console.log(pc.dim(`       after:  ${short(change.after)}`));
  }
  if (change.fix) console.log(`       ${pc.green("💡 fix:")} ${short(change.fix, 80)}`);
  for (const usage of usages) {
    const where = `${path.relative(cwd, usage.file).replaceAll("\\", "/")}:${usage.line}:${usage.column}`;
    console.log(`       ${pc.cyan(where)}  ${pc.dim(short(usage.code, 60))}`);
  }
}

program
  .name("bumpscan")
  .description("See which lines of your code an npm package upgrade will break, before you upgrade.")
  .version("0.0.1")
  .argument("<package>", "package and the version to upgrade to, e.g. axios@2")
  .option("-C, --cwd <dir>", "project folder to scan", process.cwd())
  .option("--all", "list every change, including ones your code never touches")
  .option("--json", "print the result as JSON")
  .option("--ci", "exit with code 1 when your code hits a breaking change")
  .action(async (input: string, options: { cwd: string; all?: boolean; json?: boolean; ci?: boolean }) => {
    const spinner = options.json ? undefined : ora("Downloading both versions…").start();
    try {
      const plan = await prepareUpgrade(input, options.cwd);
      if (spinner) spinner.text = "Comparing their APIs…";
      const report = await compareUpgrade(plan);
      if (spinner) spinner.text = "Scanning your code…";
      const result = scanProject(report, options.cwd);
      spinner?.stop();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(pc.bold(`\n🧨 ${result.to.name}  ${pc.dim(result.from.version)} → ${pc.cyan(result.to.version)}`));
      if (result.to.typesPackage) {
        console.log(pc.dim(`   types from ${result.from.typesPackage ?? "?"} → ${result.to.typesPackage}`));
      }
      console.log();

      if (result.from.version === result.to.version) {
        console.log(pc.green("✅ You are already on this version. Nothing to check.\n"));
        return;
      }

      const breaking = result.hits.filter((h) => h.change.severity === "breaking");
      const maybe = result.hits.filter((h) => h.change.severity === "maybe");

      const group = (title: string, list: Hit[], limit: number, icon: string, color: (s: string) => string) => {
        if (!list.length) return;
        console.log(pc.bold(color(`${title} (${list.length})`)));
        const shown = options.all ? list : list.slice(0, limit);
        for (const hit of shown) printHit(hit, options.cwd, icon, color);
        if (shown.length < list.length) console.log(pc.dim(`  …and ${list.length - shown.length} more (use --all)`));
        console.log();
      };
      group("Breaks your code", breaking, BREAKING_LIMIT, "❌", pc.red);
      group("Might break your code", maybe, MAYBE_LIMIT, "⚠️ ", pc.yellow);

      if (result.typesMissingIn) {
        console.log(pc.yellow(`⚠️  v${result.typesMissingIn} ships no type files, so its API could not be compared.`));
        console.log(pc.dim(`   Its types may live in @types/${result.to.name}. Support for that is coming.\n`));
      }

      const files = `${result.filesScanned} file${result.filesScanned === 1 ? "" : "s"}`;
      if (!result.hits.length) {
        console.log(pc.green(`✅ Nothing in your code is affected. ${pc.dim(`(${files} scanned)`)}\n`));
      } else {
        const hitFiles = new Set(result.hits.flatMap((h) => h.usages.map((u) => u.file)));
        console.log(
          pc.dim(
            `${breaking.length} breaking, ${maybe.length} risky in ${hitFiles.size} of your files ` +
              `· ${result.unusedChanges.length} other changes don't touch your code ` +
              `· ${files} scanned\n`,
          ),
        );
      }

      if (options.ci && breaking.length) process.exitCode = 1;
    } catch (error) {
      spinner?.fail();
      console.error(pc.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

program.parseAsync();
