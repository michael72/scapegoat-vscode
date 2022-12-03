import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { log } from "./logging";
import { parseScapeGoat } from "./scapegoatdiag";

/// map scala file name (i.e. Main.scala) to its location in the workspace
/// duplicates are not (yet) supported!
let scalaFilesMap: Map<string, vscode.Uri>;
/// map scapegoat xml URIs to found scala URIs
let xmlToScala: Map<vscode.Uri, Set<vscode.Uri>>;

const watchedFiles = new Set<string>();

let cleanupFun:  (scalaUris: Set<vscode.Uri>) => void;

export function filesMapInit() {
  scalaFilesMap = new Map();
  xmlToScala = new Map();
}

export function addScalaFiles(uris: vscode.Uri[], cleanup: (scalaUris: Set<vscode.Uri>) => void, addDiag: (diag: vscode.Diagnostic, uri: vscode.Uri) => void) {
  cleanupFun = cleanup
  for (const uri of uris) {
    const f = uri.fsPath;
    const scriptName = path.basename(f);
    log(scriptName + " -> " + f);
    scalaFilesMap.set(scriptName, uri);
  }
  log("find all scapegoat.xml files");
  vscode.workspace.findFiles("**/scapegoat.xml").then(
    (f) => {
      checkFilesNotEmpty(f);

      for (const xmlUri of f) {
        const scalaFiles = getScalaFiles(xmlUri);
        cleanup(scalaFiles);
        addScapegoatFiles(xmlUri, (diag: vscode.Diagnostic, scalaFileName: string): void => {
          const scalaUri = scalaFilesMap.get(scalaFileName)
          if (scalaUri) {
            addDiag(diag, scalaUri)
            scalaFiles?.add(scalaUri);
          } else {
            log(`unable to process ${scalaFileName}`);
          }
        })
      }
    },
    () => {
      log("caught error while finding xml files.");
    }
  );
}

function getScalaFiles(xmlUri: vscode.Uri): Set<vscode.Uri> {
  let scalaFiles = xmlToScala.get(xmlUri);
  if (!scalaFiles) {
    scalaFiles = new Set();
    xmlToScala.set(xmlUri, scalaFiles);
  } 
  return scalaFiles;
}

function checkFilesNotEmpty(xmlUris: vscode.Uri[]) {
  if (xmlUris.length === 0) {
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
}

function* parseXmlFile(xmlFile: string) {
  log("checking " + xmlFile);
  const data = fs.readFileSync(xmlFile, "utf8");
  for (const diag of parseScapeGoat(data)) {
    yield diag;
  }
}

function checkFile(xmlUri: vscode.Uri, cb: (diag: vscode.Diagnostic, fname: string) => void) {
  cleanupFun(getScalaFiles(xmlUri))
  for (const [diag, fname] of parseXmlFile(xmlUri.fsPath)) {
    cb(diag, fname);
  }
}

function addScapegoatFiles(xmlUri: vscode.Uri, cb: (diag: vscode.Diagnostic, fname: string) => void) {
  checkFile(xmlUri, cb);
  if (!watchedFiles.has(xmlUri.fsPath)) {
    fs.watch(xmlUri.fsPath, (event, filename) => {
      if (filename && event === "change") {
        setTimeout(() => {
          log("parsing changed scapegoat xml " + xmlUri.fsPath);
          checkFile(xmlUri, cb);
        }, 100);
      }
    });
    watchedFiles.add(xmlUri.fsPath);
  }
}
