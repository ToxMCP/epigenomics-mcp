#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { runOrderedTrendCalibration } from "../dist/trend/calibration.js";

if (!process.argv.slice(2).includes("--confirm")) {
  console.error(
    "Refusing to update the ordered-trend calibration baseline without --confirm.",
  );
  process.exit(1);
}

const report = runOrderedTrendCalibration();
if (!report.summary.ready) {
  console.error("Refusing to record a calibration baseline with failing checks.");
  process.exit(1);
}

const outputPath = join(
  process.cwd(),
  "benchmarks",
  "expected",
  "ordered_trend_calibration",
  "report.json",
);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
console.log(`Updated reviewed calibration baseline: ${outputPath}`);
