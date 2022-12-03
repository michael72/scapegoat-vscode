// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { initLog, log } from "./logging";
import { addScalaFiles, filesMapInit } from "./filesmap";

let diagnosticCollection: vscode.DiagnosticCollection;

function addDiagnostics(diag: vscode.Diagnostic, uri: vscode.Uri) {
  const saved_diag = diagnosticCollection.get(uri);
  const diagnostics: vscode.Diagnostic[] = saved_diag ? [...saved_diag, diag] : [diag];
  diagnosticCollection.set(uri, new Set(diagnostics));
  log(`${uri.fsPath}: ${diag.range.start.line}`);
  log(`${diag.severity}: ${diag.message}`);
}

function cleanupDiagnosics(uris: Set<vscode.Uri>) {
  for (const uri of uris) {
    diagnosticCollection.set(uri, []);
  }
}

export function activate(context: vscode.ExtensionContext) {
  initLog();
  log("Init");

  const disposable = vscode.commands.registerCommand("ScapeGoat.Run", () => {
    console.log("ScapeGoat: running cmd....");
    diagnosticCollection.clear();
    filesMapInit();

    log("find all scala files");
    vscode.workspace.findFiles("**/*.scala").then(
      (f) => addScalaFiles(f, cleanupDiagnosics, addDiagnostics),
      () => {
        log("caught error while finding scala files.");
      }
    );
  });

  context.subscriptions.push(disposable);
  diagnosticCollection =
    vscode.languages.createDiagnosticCollection("scapegoat");
  context.subscriptions.push(diagnosticCollection);
}

// This method is called when your extension is deactivated
export function deactivate() {
  // empty
}
