import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { log } from "./logging";
import { parseScapeGoat } from "./scapegoatdiag";

let filesMap: Map<string, vscode.Uri>;

export function filesMapInit() {
    filesMap = new Map();
}

export function addScalaFiles(uris: vscode.Uri[], cb: (diag: vscode.Diagnostic, uri: vscode.Uri) => void) {
  for (const uri of uris) {
    const f = uri.fsPath;
    const scriptName = path.basename(f);
    log(scriptName + " -> " + f);
    filesMap.set(scriptName, uri);
  }
  log("find all scapegoat.xml files");
  vscode.workspace.findFiles("**/scapegoat.xml").then(
    (f) => addScapegoatFiles(f, (diag: vscode.Diagnostic, fname: string): void => {
      const uri = filesMap.get(fname)
      if (uri) {
        cb(diag, uri)
      } else {
        log(`unable to process ${fname}`);
      }
    }),
    () => {
      log("caught error while finding xml files.");
    }
  );
}

export function* parseXmlFile(xmlFile: string) {
  log("checking " + xmlFile);
  const data = fs.readFileSync(xmlFile, "utf8");
  for (const diag of parseScapeGoat(data)) {
    yield diag;
  }
}

function checkFile(uri: vscode.Uri, cb: (diag: vscode.Diagnostic, fname: string) => void) {
   for (const [diag, fname] of parseXmlFile(uri.fsPath)) {
      cb(diag, fname);
   }
}

function addScapegoatFiles(uris: vscode.Uri[], cb: (diag: vscode.Diagnostic, fname: string) => void) {
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
    checkFile(uri, cb);
    fs.watch(uri.fsPath, (event, filename) => {
      if (filename && event === "change") {
        setTimeout(() => {
          log("parsing changed scapegoat xml " + uri.fsPath);
          checkFile(uri, cb);
        }, 100);
      }
    });
  }
}
