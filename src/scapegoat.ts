// Pure (vscode independent) parsing of scapegoat XML reports and
// resolution of the reported file names to actual scala source files.
import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface ScapegoatWarning {
  /** File as written by scapegoat, e.g. `com.example.Main.scala`. */
  file: string;
  /** 1-based line number. */
  line: number;
  level: string;
  /** Short inspection name, e.g. `UnusedMethodParameter`. */
  inspection: string;
  text: string;
  explanation: string;
  snippet?: string;
}

export interface ParseResult {
  warnings: ScapegoatWarning[];
  errors: string[];
}

type RawWarning = Record<string, string | undefined>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "_",
  // never convert attribute values to numbers/booleans
  parseAttributeValue: false,
  // always return an array, regardless of the number of warnings
  isArray: (name) => name === "warning",
});

function shortName(qualified: string): string {
  const idx = qualified.lastIndexOf(".");
  return idx >= 0 ? qualified.substring(idx + 1) : qualified;
}

export function parseScapegoatXml(xml: string): ParseResult {
  const errors: string[] = [];
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    const { msg, line } = validation.err;
    return { warnings: [], errors: [`invalid XML (line ${line}): ${msg}`] };
  }

  let parsed: { scapegoat?: { warning?: RawWarning[] } | string };
  try {
    parsed = parser.parse(xml) as typeof parsed;
  } catch (e) {
    return { warnings: [], errors: [`unable to parse XML: ${String(e)}`] };
  }

  const root = parsed.scapegoat;
  if (root === undefined) {
    return { warnings: [], errors: ["no <scapegoat> root element found"] };
  }
  // an empty `<scapegoat count="0"/>` element might be parsed as string
  const raw = typeof root === "object" ? (root.warning ?? []) : [];

  const warnings: ScapegoatWarning[] = [];
  for (const w of raw) {
    const file = w._file;
    const line = Number(w._line);
    if (file === undefined || file === "") {
      errors.push("warning without file attribute");
    } else if (Number.isInteger(line)) {
      warnings.push({
        file,
        // warnings without a proper position are shown on the first line
        line: Math.max(1, line),
        level: w._level ?? "",
        inspection: shortName(w._inspection ?? ""),
        text: w._text ?? "",
        explanation: w._explanation ?? w._text ?? "",
        snippet: w._snippet,
      });
    } else {
      errors.push(`invalid line '${w._line ?? ""}' in ${file}`);
    }
  }
  return { warnings, errors };
}

/**
 * Normalizes a path or a scapegoat file name to a dotted form:
 * `src/main/scala/com/example/Main.scala` -> `src.main.scala.com.example.Main.scala`
 */
function dotted(p: string): string {
  return p.replace(/[\\/]+/g, ".");
}

/** Extracts the file name, e.g. `com.example.Main.scala` -> `Main.scala`. */
export function scalaBaseName(reported: string): string | undefined {
  const m = /([^.\\/]+\.(?:scala|sc))$/.exec(reported);
  return m ? m[1] : undefined;
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) {
    ++i;
  }
  return i;
}

/**
 * Picks the best matching file for the reported (dotted) scapegoat file name
 * out of the candidate paths that share the same base name.
 * Candidates whose path ends with the reported package path are preferred.
 * Remaining ties are resolved by the longest common path prefix with the
 * scapegoat report, i.e. the file of the same (sub)project wins.
 */
export function resolveScalaFile(
  reported: string,
  candidates: readonly string[],
  reportPath: string
): string | undefined {
  if (candidates.length <= 1) {
    return candidates[0];
  }
  const suffix = "." + dotted(reported).replace(/^\.+/, "");
  const matching = candidates.filter((c) => ("." + dotted(c)).endsWith(suffix));
  const pool = matching.length > 0 ? matching : candidates;

  let best = pool[0];
  let bestLen = -1;
  for (const c of pool) {
    const len = commonPrefixLength(c, reportPath);
    if (len > bestLen) {
      best = c;
      bestLen = len;
    }
  }
  return best;
}
