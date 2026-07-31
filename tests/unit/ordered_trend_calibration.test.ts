import { describe, expect, it } from "vitest";

import {
  OrderedTrendCalibrationReportSchema,
  runOrderedTrendCalibration,
} from "../../src/trend/calibration.js";

describe("ordered-trend simulation calibration", () => {
  it("passes the deterministic ADEMP release protocol", () => {
    const report = runOrderedTrendCalibration();

    expect(OrderedTrendCalibrationReportSchema.safeParse(report).success).toBe(
      true,
    );
    expect(report.summary).toEqual({
      gatedCheckCount: 13,
      passedGatedCheckCount: 13,
      diagnosticScenarioCount: 3,
      ready: true,
    });
    expect(report.referenceCases.every((result) => result.passed)).toBe(true);
    expect(report.monteCarloAgreement.passed).toBe(true);
    expect(report.effectIntervalCoverage.every((result) => result.passed)).toBe(
      true,
    );
  });

  it("gates exchangeable nulls but keeps violated-exchangeability cases diagnostic", () => {
    const report = runOrderedTrendCalibration();
    const nullScenarios = report.scenarios.filter(
      (scenario) => scenario.assumptionStatus === "exchangeable_null",
    );
    const stressScenarios = report.scenarios.filter(
      (scenario) => scenario.assumptionStatus === "exchangeability_violated",
    );

    expect(nullScenarios).toHaveLength(4);
    expect(
      nullScenarios.every(
        (scenario) =>
          scenario.decision.gated && scenario.decision.passed === true,
      ),
    ).toBe(true);
    expect(stressScenarios).toHaveLength(2);
    expect(
      stressScenarios.every(
        (scenario) =>
          !scenario.decision.gated && scenario.decision.passed === null,
      ),
    ).toBe(true);
    expect(report.interpretationBoundaries.join(" ")).toContain(
      "does not establish universal statistical validity",
    );
  });

  it("is byte-stable across repeated runs", () => {
    expect(JSON.stringify(runOrderedTrendCalibration())).toBe(
      JSON.stringify(runOrderedTrendCalibration()),
    );
  });
});
