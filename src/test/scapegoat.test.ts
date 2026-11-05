import * as assert from "assert";
import { parseScapegoatXml, resolveScalaFile, scalaBaseName } from "../scapegoat";

const header = '<?xml version="1.0" encoding="UTF-8"?>';

function warning(file: string, line: string, extra = ""): string {
  return `<warning line="${line}" text="Unused parameter" snippet="x" level="Warning" file="${file}" inspection="com.sksamuel.scapegoat.inspections.unneccesary.UnusedMethodParameter" explanation="Unused &amp; useless" ${extra}/>`;
}

suite("parseScapegoatXml", () => {
  test("empty report", () => {
    const r = parseScapegoatXml(`${header}<scapegoat count="0" warns="0" errors="0" infos="0"></scapegoat>`);
    assert.deepStrictEqual(r, { warnings: [], errors: [] });
    const r2 = parseScapegoatXml(`${header}<scapegoat count="0"/>`);
    assert.deepStrictEqual(r2, { warnings: [], errors: [] });
  });

  test("single warning", () => {
    const r = parseScapegoatXml(`${header}<scapegoat count="1">${warning("com.example.Main.scala", "12")}</scapegoat>`);
    assert.deepStrictEqual(r.errors, []);
    assert.deepStrictEqual(r.warnings, [
      {
        file: "com.example.Main.scala",
        line: 12,
        level: "Warning",
        inspection: "UnusedMethodParameter",
        text: "Unused parameter",
        explanation: "Unused & useless",
        snippet: "x",
      },
    ]);
  });

  test("multiple warnings, independent of the count attribute", () => {
    const r = parseScapegoatXml(
      `${header}<scapegoat count="1">${warning("a.A.scala", "1")}${warning("b.B.scala", "2")}</scapegoat>`
    );
    assert.deepStrictEqual(r.warnings.map((w) => w.file), ["a.A.scala", "b.B.scala"]);
  });

  test("invalid lines are reported, missing positions use line 1", () => {
    const r = parseScapegoatXml(`${header}<scapegoat>${warning("a.A.scala", "0")}${warning("a.A.scala", "x")}</scapegoat>`);
    assert.deepStrictEqual(r.warnings.map((w) => w.line), [1]);
    assert.strictEqual(r.errors.length, 1);
  });

  test("truncated XML does not throw", () => {
    const r = parseScapegoatXml(`${header}<scapegoat count="1"><warning line="1" `);
    assert.strictEqual(r.warnings.length, 0);
    assert.strictEqual(r.errors.length, 1);
  });

  test("missing root element", () => {
    const r = parseScapegoatXml(`${header}<other/>`);
    assert.strictEqual(r.errors.length, 1);
  });
});

suite("scalaBaseName", () => {
  test("package path", () => assert.strictEqual(scalaBaseName("com.example.Main.scala"), "Main.scala"));
  test("default package", () => assert.strictEqual(scalaBaseName("Main.scala"), "Main.scala"));
  test("full path", () => assert.strictEqual(scalaBaseName("/a/b/Main.scala"), "Main.scala"));
  test("windows path", () => assert.strictEqual(scalaBaseName("C:\\a\\b\\Main.scala"), "Main.scala"));
  test("script", () => assert.strictEqual(scalaBaseName("build.sc"), "build.sc"));
  test("no scala file", () => assert.strictEqual(scalaBaseName("Main.java"), undefined));
});

suite("resolveScalaFile", () => {
  const a = "/ws/a/src/main/scala/com/a/Main.scala";
  const b = "/ws/b/src/main/scala/com/b/Main.scala";
  const b2 = "/ws/b2/src/main/scala/com/b/Main.scala";

  test("no or single candidate", () => {
    assert.strictEqual(resolveScalaFile("com.a.Main.scala", [], "/ws/a/target/scapegoat.xml"), undefined);
    assert.strictEqual(resolveScalaFile("com.a.Main.scala", [a], "/ws/x/scapegoat.xml"), a);
  });

  test("package path decides", () => {
    assert.strictEqual(resolveScalaFile("com.b.Main.scala", [a, b], "/ws/a/target/scapegoat.xml"), b);
    assert.strictEqual(resolveScalaFile("com.a.Main.scala", [b, a], "/ws/b/target/scapegoat.xml"), a);
  });

  test("report location decides between equal packages", () => {
    assert.strictEqual(resolveScalaFile("com.b.Main.scala", [a, b, b2], "/ws/b2/target/scapegoat.xml"), b2);
    assert.strictEqual(resolveScalaFile("com.b.Main.scala", [a, b2, b], "/ws/b/target/scapegoat.xml"), b);
  });

  test("unnormalized full path", () => {
    assert.strictEqual(
      resolveScalaFile("ws.b2.src.main.scala.com.b.Main.scala", [b, b2], "/elsewhere/scapegoat.xml"),
      b2
    );
  });
});
