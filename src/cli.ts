#!/usr/bin/env node
import { Command } from "commander";
import ora from "ora";
import pc from "picocolors";
import { compareUpgrade, prepareUpgrade, type ApiChange } from "./index.js";

/** How many lines of each group to show before folding the rest (unless --all). */
const BREAKING_LIMIT = 25;
const MAYBE_LIMIT = 15;

const program = new Command();

function short(text: string | undefined, max = 70) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function printChange(change: ApiChange, icon: string, color: (s: string) => string) {
  console.log(`  ${icon} ${color(change.path)}  ${pc.dim(change.message)}`);
  if (change.before !== undefined && change.after !== undefined) {
    console.log(pc.dim(`       before: ${short(change.before)}`));
    console.log(pc.dim(`       after:  ${short(change.after)}`));
  }
}

program
  .name("bumpscan")
  .description("See which lines of your code an npm package upgrade will break, before you upgrade.")
  .version("0.0.1")
  .argument("<package>", "package and the version to upgrade to, e.g. axios@2")
  .option("-C, --cwd <dir>", "project folder to scan", process.cwd())
  .option("--all", "list every change, including new additions")
  .option("--json", "print the result as JSON")
  .action(async (input: string, options: { cwd: string; all?: boolean; json?: boolean }) => {
    const spinner = options.json ? undefined : ora("Downloading both versions…").start();
    try {
      const plan = await prepareUpgrade(input, options.cwd);
      if (spinner) spinner.text = "Comparing their APIs…";
      const report = await compareUpgrade(plan);
      spinner?.stop();

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      console.log(pc.bold(`\n🧨 ${report.to.name}  ${pc.dim(report.from.version)} → ${pc.cyan(report.to.version)}\n`));

      if (report.from.version === report.to.version) {
        console.log(pc.green("✅ You are already on this version. Nothing to check.\n"));
        return;
      }
      const breaking = report.changes.filter((c) => c.severity === "breaking");
      const maybe = report.changes.filter((c) => c.severity === "maybe");
      const safe = report.changes.filter((c) => c.severity === "safe");

      const group = (title: string, list: ApiChange[], limit: number, icon: string, color: (s: string) => string) => {
        if (!list.length) return;
        console.log(pc.bold(color(`${title} (${list.length})`)));
        const shown = options.all ? list : list.slice(0, limit);
        for (const change of shown) printChange(change, icon, color);
        if (shown.length < list.length) console.log(pc.dim(`  …and ${list.length - shown.length} more (use --all)`));
        console.log();
      };
      group("Breaking", breaking, BREAKING_LIMIT, "❌", pc.red);
      group("Might break", maybe, MAYBE_LIMIT, "⚠️ ", pc.yellow);

      if (report.typesMissingIn) {
        console.log(pc.yellow(`⚠️  v${report.typesMissingIn} ships no type files, so its API could not be compared.`));
        console.log(pc.dim(`   Its types may live in @types/${report.to.name}. Support for that is coming.\n`));
      }

      if (safe.length) {
        if (options.all) {
          console.log(pc.bold(pc.green(`Added (${safe.length})`)));
          for (const change of safe) printChange(change, "➕", pc.green);
        } else {
          console.log(pc.green(`➕ ${safe.length} new things added ${pc.dim("(use --all to list them)")}`));
        }
        console.log();
      }

      if (!report.changes.length && !report.typesMissingIn) console.log(pc.green("✅ No API changes found.\n"));

      console.log(pc.dim("Next up: showing which of these your own code actually uses.\n"));
    } catch (error) {
      spinner?.fail();
      console.error(pc.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

program.parseAsync();
