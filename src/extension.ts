import * as vscode from "vscode";

import { initLog, log } from "./logging";
import { ScapegoatDiagnostics } from "./diagnostics";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(initLog());
  log("Init");

  const diagnostics = new ScapegoatDiagnostics();
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.commands.registerCommand("ScapeGoat.Run", async () => {
      try {
        await diagnostics.run();
      } catch (e) {
        log(`error while running scapegoat parser: ${String(e)}`);
      }
    })
  );
}

export function deactivate(): void {
  // everything is disposed via context.subscriptions
}
