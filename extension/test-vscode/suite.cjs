/**
 * Runs inside a real VS Code window:
 *
 *   code --extensionDevelopmentPath=extension --extensionTestsPath=extension/test-vscode/suite.cjs <project>
 *
 * It drives the extension the way a person would and checks the marks that appear in the code.
 */
const assert = require("node:assert");
const path = require("node:path");
const vscode = require("vscode");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until diagnostics show up, or gives up. */
async function waitForProblems(timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = vscode.languages.getDiagnostics().filter(([, list]) => list.some((d) => d.source === "bumpscan"));
    if (found.length) return found;
    await wait(1000);
  }
  return [];
}

exports.run = async function run() {
  const log = [];
  const say = (line) => {
    log.push(line);
    console.log(line);
  };

  const extension = vscode.extensions.getExtension("AHMADMALIK1376.bumpscan-vscode");
  assert.ok(extension, "extension not found");
  await extension.activate();
  say("activated");

  const commands = await vscode.commands.getCommands(true);
  for (const id of ["bumpscan.checkOne", "bumpscan.checkAll", "bumpscan.clear"]) {
    assert.ok(commands.includes(id), `command missing: ${id}`);
  }
  say("commands registered: checkOne, checkAll, clear");

  // Pass the target directly, so no input box is needed.
  vscode.commands.executeCommand("bumpscan.checkOne", "express@5");

  const found = await waitForProblems();
  assert.ok(found.length, "no problems appeared within the timeout");

  for (const [uri, list] of found) {
    for (const problem of list) {
      const line = problem.range.start.line + 1;
      const kind = problem.severity === vscode.DiagnosticSeverity.Error ? "error" : "warning";
      const text = problem.message.split("\n")[0];
      say(`${kind}  ${path.basename(uri.fsPath)}:${line}  ${text}`);
      assert.ok(problem.range.end.character > problem.range.start.character, "empty range");
    }
  }

  const all = found.flatMap(([, list]) => list);
  const messages = all.map((problem) => problem.message).join("\n");
  assert.match(messages, /Request\.param/, "expected the removed req.param() to be marked");
  assert.match(messages, /Response\.sendfile/, "expected the removed res.sendfile() to be marked");
  assert.ok(
    all.some((problem) => problem.severity === vscode.DiagnosticSeverity.Error),
    "expected at least one error",
  );

  await vscode.commands.executeCommand("bumpscan.clear");
  await wait(500);
  const left = vscode.languages.getDiagnostics().flatMap(([, list]) => list.filter((d) => d.source === "bumpscan"));
  assert.strictEqual(left.length, 0, "clear did not remove the marks");
  say("clear removed every mark");

  say(`PASSED (${all.length} problems)`);
};
