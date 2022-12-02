import * as vscode from "vscode";

let logChannel: vscode.OutputChannel;

export function initLog() {
  logChannel = vscode.window.createOutputChannel("Scapegoat");
  logChannel.show();
}
export function log(msg: string) {
  logChannel.appendLine(msg);
}
