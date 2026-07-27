#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
const sourceRoot = join(root, "src");
const violations = [];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(path)));
    } else if ([".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

function addViolation(filePath, source, node, rule, message) {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  violations.push({
    file: relative(root, filePath),
    line: position.line + 1,
    column: position.character + 1,
    rule,
    message,
  });
}

function inspectNode(filePath, source, node) {
  if (node.kind === ts.SyntaxKind.AnyKeyword) {
    addViolation(
      filePath,
      source,
      node,
      "no-explicit-any",
      "Use a concrete type or unknown instead of any.",
    );
  }
  if (node.kind === ts.SyntaxKind.DebuggerStatement) {
    addViolation(
      filePath,
      source,
      node,
      "no-debugger",
      "Remove debugger statements from production source.",
    );
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "eval"
  ) {
    addViolation(filePath, source, node, "no-eval", "Dynamic eval is not allowed.");
  }
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "Function"
  ) {
    addViolation(
      filePath,
      source,
      node,
      "no-new-function",
      "Dynamic Function construction is not allowed.",
    );
  }
  ts.forEachChild(node, (child) => inspectNode(filePath, source, child));
}

for (const filePath of await sourceFiles(sourceRoot)) {
  const text = await readFile(filePath, "utf8");
  const source = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  for (const diagnostic of source.parseDiagnostics) {
    const start = diagnostic.start ?? 0;
    const position = source.getLineAndCharacterOfPosition(start);
    violations.push({
      file: relative(root, filePath),
      line: position.line + 1,
      column: position.character + 1,
      rule: "valid-syntax",
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    });
  }

  for (const match of text.matchAll(/@ts-(?:ignore|nocheck)\b/g)) {
    const position = source.getLineAndCharacterOfPosition(match.index);
    violations.push({
      file: relative(root, filePath),
      line: position.line + 1,
      column: position.character + 1,
      rule: "no-ts-suppression",
      message: "Use a typed solution instead of @ts-ignore or @ts-nocheck.",
    });
  }

  inspectNode(filePath, source, source);
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line}:${violation.column} ${violation.rule} — ${violation.message}`,
    );
  }
  console.error(`\n${violations.length} lint violation(s) found.`);
  process.exit(1);
}

console.log("Source lint passed (syntax, explicit-any, suppression, debugger, and dynamic-code rules).");
