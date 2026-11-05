import * as vscode from "vscode";

let logChannel: vscode.OutputChannel | undefined;

export function initLog(): vscode.OutputChannel {
  logChannel = vscode.window.createOutputChannel("Scapegoat");
  return logChannel;
}

export function showLog(): void {
  logChannel?.show(true);
}

export function log(msg: string): void {
  logChannel?.appendLine(msg);
}
