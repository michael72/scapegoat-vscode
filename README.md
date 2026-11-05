# scapegoat-vscode

Visual Studio Code extension to parse [scapegoat](https://github.com/scapegoat-scala/scapegoat) output XML files and show them in problem view.

## Features

- Shows all warnings of every `scapegoat.xml` report in the workspace (multi-project builds are supported) in the problems view.
- Automatic update of the problems view when a `scapegoat.xml` has been updated (also when it was deleted and re-created).
- Scala files with the same name in different packages or sub projects are matched by their package path.

## Requirements

The scapegoat job (`sbt scapegoat`) needs to have run on the project to properly update the problems view.

Run `ScapeGoat: Run parser`.

## Development

```bash
npm install
npm test
```
