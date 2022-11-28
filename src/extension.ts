// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

import { XMLParser } from "fast-xml-parser";

let diagnosticCollection: vscode.DiagnosticCollection;

let filesMap: Map<string, vscode.Uri>;
let xmlToScala: Map<string, Set<vscode.Uri>>;

const regexFile = /.*\.([^.]+\.scala)/;
const regexClass = /.*\.([^.]+)/;
const levelMap: Map<string, vscode.DiagnosticSeverity> = new Map([
  ["Error", vscode.DiagnosticSeverity.Error],
  ["Warning", vscode.DiagnosticSeverity.Warning],
  ["Info", vscode.DiagnosticSeverity.Information],
  ["Hint", vscode.DiagnosticSeverity.Hint],
]);
let log: vscode.OutputChannel;

interface ScapeGoatWarning {
  _line: string;
  _file: string;
  _level: string;
  _explanation: string;
  _snippet: string;
  _inspection: string;
}

interface ScapeGoatObj {
  _count: string;
  warning: unknown;
}

function getWarnings(scapegoat: ScapeGoatObj): ScapeGoatWarning[] {
  if (scapegoat._count === "0") {
    return [];
  }
  if (scapegoat._count === "1") {
    return [scapegoat.warning as ScapeGoatWarning];
  }
  return scapegoat.warning as ScapeGoatWarning[];
}

interface JsonObj {
  scapegoat: ScapeGoatObj;
}

function parse(xml: string) {
  log.appendLine("checking " + xml);
  const data = fs.readFileSync(xml, "utf8");
  const options = {
    ignoreAttributes: false,
    attributeNamePrefix: "_",
  };
  const parser = new XMLParser(options);
  const jObj: JsonObj = parser.parse(data) as JsonObj;

  const sc = jObj.scapegoat;

  let scalaFiles = xmlToScala.get(xml);
  if (scalaFiles === undefined) {
    scalaFiles = new Set();
    xmlToScala.set(xml, scalaFiles);
  } else {
    // clean up old stuff
    for (const uri of scalaFiles) {
      diagnosticCollection.set(uri, []);
    }
  }

  try {
    //const count = Number(sc._count as string)
    if (sc._count !== "0") {
      for (const w of getWarnings(sc)) {
        const lineno = Number(w._line);
        const file: string = w._file;
        const level = w._level;
        let txt = w._explanation;
        const snippet = w._snippet;
        const clz = w._inspection;

        log.appendLine("checking scala " + file);

        const mClz = regexClass.exec(clz);
        if (mClz) {
          txt = mClz[1] + ": " + txt;
        }
        const m = regexFile.exec(file);
        if (m) {
          const fname = m[1];
          const uri = filesMap.get(fname);
          if (uri) {
            scalaFiles.add(uri);
            const lvl = levelMap.get(level);
            if (lvl === undefined) {
              log.appendLine(`unknown level type: '${level}`);
            }
            // lineno is 0-based
            const diag = new vscode.Diagnostic(
              new vscode.Range(lineno - 1, 0, lineno, 0),
              txt,
              lvl
            );
            diag.code = snippet;
            diag.source = "scapegoat";
            const diagcp = diagnosticCollection.get(uri);
            let diagnostics: vscode.Diagnostic[];
            if (diagcp) {
              diagnostics = [...diagcp];
            } else {
              diagnostics = [];
            }
            diagnostics.push(diag);
            diagnosticCollection.set(uri, diagnostics);
            log.appendLine(`${uri.fsPath}: ${lineno}`);
            log.appendLine(`${level}: ${txt}`);
          } else {
            log.appendLine("unable to process " + fname);
          }
        } else {
          log.appendLine(`file did not match regex ${file}`);
        }
      }
    }
  } catch (_) {
    log.appendLine("caught error in processing " + xml);
  }
}

function addScalaFiles(uris: vscode.Uri[]) {
  for (const uri of uris) {
    const f = uri.fsPath;
    const scriptName = path.basename(f);
    log.appendLine(scriptName + " -> " + f);
    filesMap.set(scriptName, uri);
  }
  log.appendLine("find all scapegoat.xml files");
  vscode.workspace.findFiles("**/scapegoat.xml").then(
    (f) => addScapegoatFiles(f),
    () => {
      log.appendLine("caught error while finding xml files.");
    }
  );
}

function addScapegoatFiles(uris: vscode.Uri[]) {
  if (uris.length === 0) {
    vscode.window
      .showErrorMessage(
        "No scapegoat xml files were found!\nPlease run the `sbt scapegoat` job!",
        { modal: true }
      )
      .then(
        () => {
          // ignore
        },
        () => {
          // ignore
        }
      );
  }
  for (const uri of uris) {
    parse(uri.fsPath);
    fs.watch(uri.fsPath, (event, filename) => {
      if (filename && event === "change") {
        setTimeout(() => {
          log.appendLine("parsing changed scapegoat xml " + uri.fsPath);
          parse(uri.fsPath);
        }, 100);
      }
    });
  }
}

export function activate(context: vscode.ExtensionContext) {
  log = vscode.window.createOutputChannel("Scapegoat");
  log.show();
  log.appendLine("Init");

  const disposable = vscode.commands.registerCommand("ScapeGoat.Run", () => {
    console.log("ScapeGoat: running cmd....");
    diagnosticCollection.clear();
    xmlToScala = new Map();
    filesMap = new Map();

    log.appendLine("find all scala files");
    vscode.workspace.findFiles("**/*.scala").then(
      (f) => addScalaFiles(f),
      () => {
        log.appendLine("caught error while finding scala files.");
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
