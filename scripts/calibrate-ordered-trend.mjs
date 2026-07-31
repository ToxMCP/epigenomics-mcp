#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { runOrderedTrendCalibration } from "../dist/trend/calibration.js";

function parseArgs(argv) {
  const args = {
    outDir: join(process.cwd(), "benchmark-results"),
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--out-dir" || arg === "--output-dir") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a directory value`);
      args.outDir = resolve(value);
      index++;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

const { outDir } = parseArgs(process.argv.slice(2));
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const report = runOrderedTrendCalibration();
const reportPath = join(outDir, "ordered-trend-calibration.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");

for (const scenario of report.scenarios) {
  const status = scenario.decision.gated
    ? scenario.decision.passed
      ? "PASS"
      : "FAIL"
    : "INFO";
  console.log(
    `[${status}] ${scenario.id}: rejection rate ${scenario.rejectionRate.toFixed(3)} ` +
      `(99% Wilson ${scenario.rejectionRateWilsonInterval.lower.toFixed(3)}–` +
      `${scenario.rejectionRateWilsonInterval.upper.toFixed(3)})`,
  );
}
console.log(
  `${report.summary.passedGatedCheckCount}/${report.summary.gatedCheckCount} ` +
    `gated calibration checks passed; ${report.summary.diagnosticScenarioCount} ` +
    `stress/weak-signal scenarios reported without validity claims.`,
);
console.log(`Wrote ${reportPath}`);

if (!report.summary.ready) process.exit(1);
