#!/usr/bin/env node

import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "evaluation.xml";
const xml = readFileSync(path, "utf-8");
const pairPattern =
  /<qa_pair>\s*<question>([\s\S]*?)<\/question>\s*<answer>([\s\S]*?)<\/answer>\s*<\/qa_pair>/g;
const pairs = [...xml.matchAll(pairPattern)].map((match) => ({
  question: match[1].trim(),
  answer: match[2].trim(),
}));

const failures = [];
if (
  !xml.trim().startsWith("<evaluation>") ||
  !xml.trim().endsWith("</evaluation>")
) {
  failures.push("Root element must be <evaluation>.");
}
if ((xml.match(/<qa_pair>/g) ?? []).length !== pairs.length) {
  failures.push(
    "Every qa_pair must contain exactly one question followed by one answer.",
  );
}
if (pairs.length !== 10) {
  failures.push(`Expected exactly 10 qa_pair elements, found ${pairs.length}.`);
}
if (new Set(pairs.map((pair) => pair.question)).size !== pairs.length) {
  failures.push("Evaluation questions must be unique.");
}
for (const [index, pair] of pairs.entries()) {
  if (pair.question.length < 80) {
    failures.push(
      `Question ${index + 1} is too short to exercise a realistic workflow.`,
    );
  }
  if (!pair.answer || pair.answer.includes("\n")) {
    failures.push(`Answer ${index + 1} must be one non-empty value.`);
  }
}

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}

console.log(
  `Evaluation validation passed: ${pairs.length} independent QA pairs.`,
);
