#!/usr/bin/env node
import { Command } from "commander";
import ora from "ora";
import pc from "picocolors";
import { prepareUpgrade } from "./index.js";

const program = new Command();

program
  .name("bumpscan")
  .description("See which lines of your code an npm package upgrade will break, before you upgrade.")
  .version("0.0.1")
  .argument("<package>", "package and the version to upgrade to, e.g. axios@2")
  .option("-C, --cwd <dir>", "project folder to scan", process.cwd())
  .option("--json", "print the result as JSON")
  .action(async (input: string, options: { cwd: string; json?: boolean }) => {
    const spinner = options.json ? undefined : ora("Downloading both versions…").start();
    try {
      const plan = await prepareUpgrade(input, options.cwd);
      spinner?.stop();

      if (options.json) {
        console.log(JSON.stringify(plan, null, 2));
        return;
      }

      console.log(pc.bold(`\n🧨 ${plan.to.name}  ${pc.dim(plan.from.version)} → ${pc.cyan(plan.to.version)}\n`));
      if (plan.from.version === plan.to.version) {
        console.log(pc.green("✅ You are already on this version. Nothing to check."));
        return;
      }

      const line = (label: string, file: string | undefined) =>
        console.log(`  ${label}  ${file ? pc.green("types found") : pc.yellow("no types shipped (try @types/…)")}`);
      line(`v${plan.from.version}`, plan.from.types);
      line(`v${plan.to.version}`, plan.to.types);

      console.log(pc.dim("\nComparing the two versions is the next step to build.\n"));
    } catch (error) {
      spinner?.fail();
      console.error(pc.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

program.parseAsync();
