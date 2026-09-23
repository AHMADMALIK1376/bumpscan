import { readFile } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import {
  dependencyItems,
  projectWideChanges,
  summarise,
  toProblems,
  type ScanResult,
} from "./report.js";
import { scanAll, scanOne, type Runner } from "./run.js";

let problems: vscode.DiagnosticCollection;
let output: vscode.OutputChannel;

function settings() {
  const config = vscode.workspace.getConfiguration("bumpscan");
  return {
    runner: config.get<Runner>("runner", "npx"),
    includeRisky: config.get<boolean>("includeRisky", true),
  };
}

function workspaceFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    vscode.window.showErrorMessage("bumpscan: open a folder with a package.json first.");
    return undefined;
  }
  return folders[0];
}

/** Reads a file's lines, once per file, so every usage in it is cheap to place. */
async function lineReader(files: string[]) {
  const cache = new Map<string, string[]>();
  await Promise.all(
    [...new Set(files)].map(async (file) => {
      try {
        cache.set(file, (await readFile(file, "utf8")).split(/\r?\n/));
      } catch {
        cache.set(file, []);
      }
    }),
  );
  return (file: string, line: number) => cache.get(file)?.[line - 1] ?? "";
}

async function show(scan: ScanResult, folder: vscode.WorkspaceFolder) {
  const { includeRisky } = settings();
  problems.clear();

  const lineTextOf = await lineReader(scan.hits.flatMap((hit) => hit.usages.map((usage) => usage.file)));
  const found = toProblems(scan, lineTextOf, includeRisky);

  const byFile = new Map<string, vscode.Diagnostic[]>();
  for (const problem of found) {
    const range = new vscode.Range(problem.line, problem.startColumn, problem.line, problem.endColumn);
    const diagnostic = new vscode.Diagnostic(
      range,
      problem.message,
      problem.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = "bumpscan";
    byFile.set(problem.file, [...(byFile.get(problem.file) ?? []), diagnostic]);
  }
  for (const [file, list] of byFile) problems.set(vscode.Uri.file(file), list);

  const wide = projectWideChanges(scan);
  for (const change of wide) output.appendLine(`  whole project: ${change.message}`);
  output.appendLine(summarise(scan));

  if (!found.length && !wide.length) {
    vscode.window.showInformationMessage(`bumpscan: ${summarise(scan)}`);
    return;
  }

  const wideNote = wide.length ? ` Also: ${wide.map((change) => change.message).join("; ")}.` : "";
  const choice = await vscode.window.showWarningMessage(
    `bumpscan: ${summarise(scan)}.${wideNote}`,
    "Show problems",
    "Details",
  );
  if (choice === "Show problems") await vscode.commands.executeCommand("workbench.actions.view.problems");
  if (choice === "Details") output.show(true);

  // Keep the folder in the log, so a monorepo scan is easy to follow.
  output.appendLine(`  scanned ${scan.filesScanned} files in ${folder.name}`);
}

async function dependencyNames(folder: vscode.WorkspaceFolder): Promise<string[]> {
  try {
    const file = path.join(folder.uri.fsPath, "package.json");
    const json = JSON.parse((await readFile(file, "utf8")).replace(/^﻿/, ""));
    return [...Object.keys(json.dependencies ?? {}), ...Object.keys(json.devDependencies ?? {})]
      .filter((name) => !name.startsWith("@types/"))
      .sort();
  } catch {
    return [];
  }
}

async function checkOne(target?: string) {
  const folder = workspaceFolder();
  if (!folder) return;

  let chosen = target;
  if (!chosen) {
    const names = await dependencyNames(folder);
    const picked = names.length
      ? await vscode.window.showQuickPick(names, { placeHolder: "Which dependency are you thinking of upgrading?" })
      : await vscode.window.showInputBox({ prompt: "Package to check, e.g. express" });
    if (!picked) return;

    const version = await vscode.window.showInputBox({
      prompt: `Upgrade ${picked} to which version?`,
      value: "latest",
    });
    if (!version) return;
    chosen = `${picked}@${version}`;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `bumpscan: checking ${chosen}…` },
    async () => {
      try {
        const scan = await scanOne(chosen, folder.uri.fsPath, settings().runner);
        await show(scan, folder);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(message);
        vscode.window.showErrorMessage(`bumpscan failed: ${message.split("\n")[0]}`, "Details").then((choice) => {
          if (choice === "Details") output.show(true);
        });
      }
    },
  );
}

async function checkAll() {
  const folder = workspaceFolder();
  if (!folder) return;

  const scan = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "bumpscan: checking every dependency…" },
    async () => {
      try {
        return await scanAll(folder.uri.fsPath, settings().runner);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(message);
        vscode.window.showErrorMessage(`bumpscan failed: ${message.split("\n")[0]}`);
        return undefined;
      }
    },
  );
  if (!scan) return;

  const items = dependencyItems(scan);
  if (!items.length) {
    vscode.window.showInformationMessage("bumpscan: every dependency is already up to date.");
    return;
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `${items.length} upgrades available — pick one to see the lines it breaks`,
  });
  if (picked) await checkOne(`${picked.name}@${picked.to ?? "latest"}`);
}

export function activate(context: vscode.ExtensionContext) {
  problems = vscode.languages.createDiagnosticCollection("bumpscan");
  output = vscode.window.createOutputChannel("bumpscan");

  context.subscriptions.push(
    problems,
    output,
    vscode.commands.registerCommand("bumpscan.checkOne", () => checkOne()),
    vscode.commands.registerCommand("bumpscan.checkAll", () => checkAll()),
    vscode.commands.registerCommand("bumpscan.clear", () => problems.clear()),
  );
}

export function deactivate() {
  problems?.dispose();
}
