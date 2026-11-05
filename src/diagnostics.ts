import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { log, showLog } from "./logging";
import {
  parseScapegoatXml,
  resolveScalaFile,
  scalaBaseName,
  ScapegoatWarning,
} from "./scapegoat";

const SCALA_GLOB = "**/*.{scala,sc}";
const SCALA_EXCLUDE = "**/{.bloop,.metals,.git,node_modules}/**";
const REPORT_GLOB = "**/scapegoat.xml";
const POLL_INTERVAL_MS = 1000;
const DEBOUNCE_MS = 300;

const levelMap = new Map<string, vscode.DiagnosticSeverity>([
  ["error", vscode.DiagnosticSeverity.Error],
  ["warning", vscode.DiagnosticSeverity.Warning],
  ["info", vscode.DiagnosticSeverity.Information],
  ["information", vscode.DiagnosticSeverity.Information],
  ["hint", vscode.DiagnosticSeverity.Hint],
]);

function toSeverity(level: string): vscode.DiagnosticSeverity {
  const severity = levelMap.get(level.toLowerCase());
  if (severity === undefined) {
    log(`unknown level type: '${level}' - using Warning`);
    return vscode.DiagnosticSeverity.Warning;
  }
  return severity;
}

function toDiagnostic(w: ScapegoatWarning): vscode.Diagnostic {
  // scapegoat lines are 1-based, vscode lines are 0-based
  const line = w.line - 1;
  const message = w.explanation === "" ? w.text : w.explanation;
  const diag = new vscode.Diagnostic(
    new vscode.Range(line, 0, line + 1, 0),
    message,
    toSeverity(w.level)
  );
  diag.source = "scapegoat";
  if (w.inspection !== "") {
    diag.code = w.inspection;
  }
  return diag;
}

interface FileDiagnostics {
  uri: vscode.Uri;
  diagnostics: vscode.Diagnostic[];
}

/** Diagnostics of one scapegoat report: key is the scala file URI string. */
type ReportDiagnostics = Map<string, FileDiagnostics>;

export class ScapegoatDiagnostics implements vscode.Disposable {
  private readonly collection =
    vscode.languages.createDiagnosticCollection("scapegoat");
  /** scala file base name (e.g. `Main.scala`) -> all files with that name */
  private scalaFiles = new Map<string, vscode.Uri[]>();
  /** scapegoat report path -> its diagnostics */
  private readonly reports = new Map<string, ReportDiagnostics>();
  /** scapegoat report path -> stops watching the file */
  private readonly watchers = new Map<string, () => void>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /** latest update request per report - used to drop outdated results */
  private readonly updateIds = new Map<string, number>();
  private nextUpdateId = 0;

  async run(): Promise<void> {
    this.reset();
    showLog();
    log("find all scala and scapegoat.xml files");
    const [reportUris] = await Promise.all([
      vscode.workspace.findFiles(REPORT_GLOB),
      this.indexScalaFiles(),
    ]);

    if (reportUris.length === 0) {
      void vscode.window.showErrorMessage(
        "No scapegoat xml files were found!\nPlease run the `sbt scapegoat` job!",
        { modal: true }
      );
      return;
    }

    for (const uri of reportUris) {
      this.watch(uri.fsPath);
    }
    await Promise.all(reportUris.map((uri) => this.update(uri.fsPath)));
  }

  dispose(): void {
    this.reset();
    this.collection.dispose();
  }

  private reset(): void {
    for (const unwatch of this.watchers.values()) {
      unwatch();
    }
    this.watchers.clear();
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.reports.clear();
    // invalidate all pending updates
    this.updateIds.clear();
    this.collection.clear();
  }

  private async indexScalaFiles(): Promise<void> {
    const uris = await vscode.workspace.findFiles(SCALA_GLOB, SCALA_EXCLUDE);
    const index = new Map<string, vscode.Uri[]>();
    for (const uri of uris) {
      const name = path.basename(uri.fsPath);
      const list = index.get(name);
      if (list) {
        list.push(uri);
      } else {
        index.set(name, [uri]);
      }
    }
    this.scalaFiles = index;
    log(`found ${uris.length} scala files`);
  }

  private findScalaFile(reported: string, reportPath: string): vscode.Uri | undefined {
    const name = scalaBaseName(reported);
    if (name === undefined) {
      return undefined;
    }
    const candidates = this.scalaFiles.get(name) ?? [];
    const found = resolveScalaFile(
      reported,
      candidates.map((uri) => uri.fsPath),
      reportPath
    );
    return candidates.find((uri) => uri.fsPath === found);
  }

  private watch(reportPath: string): void {
    // fs.watchFile polls the file state: unlike fs.watch it survives the
    // file being deleted and re-created, which is what sbt usually does.
    const listener = (curr: fs.Stats, prev: fs.Stats): void => {
      if (curr.mtimeMs !== prev.mtimeMs) {
        this.schedule(reportPath);
      }
    };
    fs.watchFile(reportPath, { interval: POLL_INTERVAL_MS }, listener);
    this.watchers.set(reportPath, () => fs.unwatchFile(reportPath, listener));
  }

  /** debounce multiple change events while the report is being written */
  private schedule(reportPath: string): void {
    clearTimeout(this.timers.get(reportPath));
    this.timers.set(
      reportPath,
      setTimeout(() => {
        this.timers.delete(reportPath);
        log("parsing changed scapegoat xml " + reportPath);
        // scala files might have been added or moved in the meantime
        this.indexScalaFiles()
          .then(() => this.update(reportPath))
          .catch((e: unknown) => log(`error updating ${reportPath}: ${String(e)}`));
      }, DEBOUNCE_MS)
    );
  }

  private async update(reportPath: string): Promise<void> {
    const updateId = ++this.nextUpdateId;
    this.updateIds.set(reportPath, updateId);

    let xml: string | undefined;
    try {
      xml = await fs.promises.readFile(reportPath, "utf8");
    } catch (e) {
      log(`unable to read ${reportPath}: ${String(e)}`);
    }
    if (this.updateIds.get(reportPath) !== updateId) {
      return; // a newer update or a reset happened in the meantime
    }
    if (xml === undefined) {
      this.setReport(reportPath, new Map());
      return;
    }

    log("checking " + reportPath);
    const { warnings, errors } = parseScapegoatXml(xml);
    for (const err of errors) {
      log(`${reportPath}: ${err}`);
    }
    if (warnings.length === 0 && errors.length > 0) {
      // most likely the report is just being written - keep the old state
      return;
    }

    const report: ReportDiagnostics = new Map();
    const seen = new Set<string>();
    for (const w of warnings) {
      const uri = this.findScalaFile(w.file, reportPath);
      if (uri === undefined) {
        log(`unable to find scala file for ${w.file}`);
      } else {
        const diag = toDiagnostic(w);
        const key = `${uri.toString()}|${w.line}|${w.inspection}|${diag.message}`;
        if (!seen.has(key)) {
          seen.add(key);
          let entry = report.get(uri.toString());
          if (entry === undefined) {
            entry = { uri, diagnostics: [] };
            report.set(uri.toString(), entry);
          }
          entry.diagnostics.push(diag);
          log(`${uri.fsPath}:${w.line}: ${w.level}: ${diag.message}`);
        }
      }
    }
    this.setReport(reportPath, report);
  }

  private setReport(reportPath: string, report: ReportDiagnostics): void {
    const previous = this.reports.get(reportPath);
    this.reports.set(reportPath, report);

    const affected = new Map<string, vscode.Uri>();
    for (const r of [previous, report]) {
      for (const [key, { uri }] of r ?? []) {
        affected.set(key, uri);
      }
    }
    // a scala file might be part of several reports: merge all of them
    for (const [key, uri] of affected) {
      const all: vscode.Diagnostic[] = [];
      for (const r of this.reports.values()) {
        all.push(...(r.get(key)?.diagnostics ?? []));
      }
      if (all.length > 0) {
        this.collection.set(uri, all);
      } else {
        this.collection.delete(uri);
      }
    }
  }
}
