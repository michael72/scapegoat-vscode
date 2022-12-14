import * as vscode from "vscode";
import { XMLParser } from "fast-xml-parser";
import { log } from "./logging";

interface ScapeGoatWarning {
  _line: string;
  _file: string;
  _level: string;
  _explanation: string;
  _snippet: string;
  _inspection: string;
}

class ScapeGoatDiag {
  constructor(
    public fname: string,
    public lineno: number,
    public level: vscode.DiagnosticSeverity | undefined,
    public text: string,
    public code: string
  ) {}

  static regexFile = /.*\.([^.]+\.scala)/;
  static regexClass = /.*\.([^.]+)/;
  static levelMap = new Map([
    ["Error", vscode.DiagnosticSeverity.Error],
    ["Warning", vscode.DiagnosticSeverity.Warning],
    ["Info", vscode.DiagnosticSeverity.Information],
    ["Hint", vscode.DiagnosticSeverity.Hint],
  ]);

  static fromWarning(
    w: ScapeGoatWarning
  ): ScapeGoatDiag | undefined {
    const mClz = ScapeGoatDiag.regexClass.exec(w._inspection);
    let text = w._explanation;
    if (mClz) {
      text = mClz[1] + ": " + text;
    }
    const lineno = Number(w._line);
    const m = ScapeGoatDiag.regexFile.exec(w._file);
    if (m) {
      const fname = m[1];
      const level = ScapeGoatDiag.levelMap.get(w._level);
      if (level === undefined) {
        log(`unknown level type: '${w._level}`);
      }
      return new ScapeGoatDiag(fname, lineno, level, text, w._snippet);
    } else {
      log(`file did not match regex ${w._file}`);
    }

    return undefined;
  }
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

export function* parseScapeGoat(xml: string) {
  const options = {
    ignoreAttributes: false,
    attributeNamePrefix: "_",
  };
  const parser = new XMLParser(options);
  const jObj: JsonObj = parser.parse(xml) as JsonObj;

  const sc = jObj.scapegoat;

  try {
    for (const w of getWarnings(sc)) {
      const scDiag = ScapeGoatDiag.fromWarning(w);
      log("checking scala " + w._file);

      if (scDiag) {
        // lineno is 0-based
        const diag = new vscode.Diagnostic(
          new vscode.Range(scDiag.lineno - 1, 0, scDiag.lineno, 0),
          scDiag.text,
          scDiag.level
        );
        diag.code = scDiag.code;
        diag.source = "scapegoat";
        yield [diag, scDiag.fname] as const;
      }
    }
  } catch (_) {
    log("caught error in processing " + xml);
  }
}
