# Change Log

All notable changes to the "scapegoat-vscode" extension will be documented in this file.

See [Keep a Changelog](http://keepachangelog.com/).

## [0.3.0]

### Changed

- Updated dependencies (TypeScript 6, fast-xml-parser 5, ESLint 9 with flat config, typescript-eslint 8).
- Requires VS Code 1.90 or newer.
- The inspection name is shown as diagnostic code instead of the code snippet.
- Unit tests run with plain mocha (no VS Code download required).

### Fixed

- Diagnostics were duplicated or not cleared after re-running the command or after the report changed.
- Files in the default package (`file="Main.scala"`) were not found.
- Scala files with the same name in different packages/projects overwrote each other.
- A scala file reported by several `scapegoat.xml` files only showed the warnings of one report.
- Report updates stopped being detected once sbt deleted and re-created the file.
- Reading a half-written or invalid report threw an uncaught error.
- Re-running the command created additional file watchers.
- Unknown severity levels were shown as errors.
- The output channel stole the editor focus on activation.

## [0.2.0]

- Initial release
