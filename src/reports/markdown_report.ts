import type {
  ReportInput,
  FeatureClassificationSummary,
  MappingSummary,
} from "./json_report.js";
import type { ConfoundingSummary } from "../contracts/qc.js";

function countTotalFeatures(
  input: ReportInput,
): number {
  return (
    input.classificationSummary?.totalFeatures ??
    (input.qualificationResult.qualifications?.length ?? 0)
  );
}

function isMissingContext(
  contextSummary: ConfoundingSummary | undefined,
): boolean {
  if (contextSummary === undefined) return true;
  const statuses = [
    contextSummary.cellCompositionStatus,
    contextSummary.cytotoxicityStatus,
    contextSummary.stressResponseStatus,
    contextSummary.differentiationDriftStatus,
  ];
  const undefinedOrUnknown = [
    "not_evaluated",
    "unknown",
    "no_context_available",
  ];
  return statuses.some(
    (s) => s === undefined || undefinedOrUnknown.includes(s),
  );
}

function buildExclusions(input: ReportInput): string[] {
  const exclusions: string[] = [];

  if (!input.designValidation.valid) {
    exclusions.push("design_validation_failed");
  }
  if (!input.coordinateValidation.valid) {
    exclusions.push("coordinate_validation_failed");
  }

  for (const q of input.qualificationResult.qualifications ?? []) {
    if (
      q.status !== "accepted_for_pod" &&
      q.status !== "accepted_with_caveats"
    ) {
      exclusions.push(`${q.featureId}: ${q.status}`);
    }
  }

  return exclusions;
}

function buildRefusedInferences(input: ReportInput): string[] {
  const refused: string[] = [];

  if (isMissingContext(input.contextSummary)) {
    refused.push(
      "The service refused to infer confounding adjustment in the absence of complete cell-composition, cytotoxicity, stress-response, or differentiation-drift context.",
    );
  }

  if (input.mappingSummary && input.mappingSummary.nearestGeneOnlyCount > 0) {
    refused.push(
      "The service refused to infer high-confidence gene targets from nearest-gene-only mappings; pathway rollup is suppressed.",
    );
  }

  if (input.claimGuardResult) {
    if (input.claimGuardResult.persistenceStatus === "not_assessed") {
      refused.push(
        "The service refused to infer persistence of epigenomic changes because the design lacks repeated or recovery timepoints.",
      );
    }
    if (input.claimGuardResult.reversibilityStatus === "not_assessed") {
      refused.push(
        "The service refused to infer reversibility of epigenomic changes because the design lacks repeated or recovery timepoints.",
      );
    }
    if (input.claimGuardResult.heritabilityClaim === "none") {
      refused.push(
        "The service refused to infer heritability or transgenerational transmission because multigenerationalDesign is not explicitly true.",
      );
    }
  }

  return refused;
}

function renderClassificationSummary(
  summary: FeatureClassificationSummary | undefined,
  lines: string[],
): void {
  if (!summary) return;
  lines.push("- **By Class:**");
  for (const [cls, count] of Object.entries(summary.byClass)) {
    lines.push(`  - ${cls}: ${count}`);
  }
  lines.push("- **By Modality:**");
  for (const [mod, count] of Object.entries(summary.byModality)) {
    lines.push(`  - ${mod}: ${count}`);
  }
}

function renderMappingSummary(
  mapping: MappingSummary | undefined,
  lines: string[],
): void {
  lines.push(
    `- **Total Features with Region:** ${mapping?.totalFeaturesWithRegion ?? 0}`,
  );
  lines.push(`- **Mapped Features:** ${mapping?.mappedFeatures ?? 0}`);
  lines.push(
    `- **Nearest-Gene Only:** ${mapping?.nearestGeneOnlyCount ?? 0}`,
  );
  lines.push(
    `- **Ambiguous Mappings:** ${mapping?.ambiguousMappings ?? 0}`,
  );
  lines.push(
    `- **Pathway Rollup Blocked:** ${mapping?.pathwayRollupBlockedCount ?? 0}`,
  );
  lines.push("");
  lines.push(
    "> **Caveat:** Region-to-gene mapping does not imply causal target assignment.",
  );
  if ((mapping?.nearestGeneOnlyCount ?? 0) > 0) {
    lines.push(
      "> **Caveat:** Nearest-gene-only mappings represent low-confidence contextual linkage; the service suppresses pathway rollup for these features.",
    );
  }
}

function renderQualificationWarnings(input: ReportInput, lines: string[]): void {
  if (
    input.qualificationResult.warnings.length === 0 &&
    input.designValidation.warnings.length === 0 &&
    input.coordinateValidation.warnings.length === 0
  ) {
    lines.push("No warnings.");
    return;
  }

  for (const w of input.qualificationResult.warnings) {
    lines.push(`- **${w.warningCode}** (${w.severity}): ${w.message}`);
  }
  for (const w of input.designValidation.warnings) {
    lines.push(`- **DESIGN_VALIDATION** (warning): ${w}`);
  }
  for (const w of input.coordinateValidation.warnings) {
    lines.push(`- **COORDINATE_VALIDATION** (warning): ${w}`);
  }
}

/**
 * Generate a regulator-facing Markdown validation report from qualification
 * and validation outputs.
 */
export function generateMarkdownReport(input: ReportInput): string {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const reportId = input.reportId ?? crypto.randomUUID();
  const totalFeatures = countTotalFeatures(input);
  const exclusions = buildExclusions(input);
  const refusedInferences = buildRefusedInferences(input);
  const missingContext = isMissingContext(input.contextSummary);

  const lines: string[] = [];

  lines.push("# Epigenomics Validation Report");
  lines.push("");
  lines.push("| Property | Value |");
  lines.push("|----------|-------|");
  lines.push(`| Report ID | \`${reportId}\` |`);
  lines.push(`| Dataset ID | \`${input.datasetId}\` |`);
  lines.push(`| Generated At | ${generatedAt} |`);
  lines.push(`| Schema | EpigenomicsValidationReport v0.1.0 |`);
  lines.push("");

  // Design
  lines.push("## Design Validation");
  lines.push("");
  lines.push(`- **Valid:** ${input.designValidation.valid ? "Yes" : "No"}`);
  if (input.designValidation.errors.length > 0) {
    lines.push("- **Errors:**");
    for (const e of input.designValidation.errors) {
      lines.push(`  - ${e}`);
    }
  }
  if (input.designValidation.warnings.length > 0) {
    lines.push("- **Warnings:**");
    for (const w of input.designValidation.warnings) {
      lines.push(`  - ${w}`);
    }
  }
  if (input.designValidation.identifiedControlGroupId) {
    lines.push(
      `- **Identified Control Group:** \`${input.designValidation.identifiedControlGroupId}\``,
    );
  }
  lines.push("");

  // Coordinates
  lines.push("## Coordinate Validation");
  lines.push("");
  lines.push(
    `- **Valid:** ${input.coordinateValidation.valid ? "Yes" : "No"}`,
  );
  if (input.coordinateValidation.errors.length > 0) {
    lines.push("- **Errors:**");
    for (const e of input.coordinateValidation.errors) {
      lines.push(`  - ${e}`);
    }
  }
  if (input.coordinateValidation.warnings.length > 0) {
    lines.push("- **Warnings:**");
    for (const w of input.coordinateValidation.warnings) {
      lines.push(`  - ${w}`);
    }
  }
  lines.push("");

  // Platform
  lines.push("## Platform");
  lines.push("");
  lines.push(`- **Declared Platform:** ${input.platform ?? "None"}`);
  lines.push("");

  // Classification
  lines.push("## Feature Classification");
  lines.push("");
  lines.push(`- **Total Features:** ${totalFeatures}`);
  renderClassificationSummary(input.classificationSummary, lines);
  lines.push("");

  // QC
  lines.push("## QC Profile");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(input.qcProfile, null, 2));
  lines.push("```");
  lines.push("");

  // Mapping
  lines.push("## Mapping Summary");
  lines.push("");
  renderMappingSummary(input.mappingSummary, lines);
  lines.push("");

  // Context
  lines.push("## Context Summary");
  lines.push("");
  lines.push(
    `- **Cell Composition:** ${input.contextSummary?.cellCompositionStatus ?? "Not provided"}`,
  );
  lines.push(
    `- **Cytotoxicity:** ${input.contextSummary?.cytotoxicityStatus ?? "Not provided"}`,
  );
  lines.push(
    `- **Stress Response:** ${input.contextSummary?.stressResponseStatus ?? "Not provided"}`,
  );
  lines.push(
    `- **Differentiation Drift:** ${input.contextSummary?.differentiationDriftStatus ?? "Not provided"}`,
  );
  lines.push("");

  if (missingContext) {
    lines.push(
      "> **Caveat:** Missing confounding context (cell composition, cytotoxicity, stress response, or differentiation drift). The service refused to infer confounding adjustment without this information.",
    );
    lines.push("");
  }

  // Qualification
  lines.push("## Qualification Results");
  lines.push("");
  lines.push(`- **Qualified:** ${input.qualificationResult.qualifiedCount}`);
  lines.push(`- **Excluded:** ${input.qualificationResult.excludedCount}`);
  lines.push(`- **Total Features:** ${totalFeatures}`);
  lines.push("");

  if (input.claimGuardResult) {
    lines.push("### Claim Guard Results");
    lines.push("");
    lines.push(
      `- **Persistence Status:** ${input.claimGuardResult.persistenceStatus}`,
    );
    lines.push(
      `- **Reversibility Status:** ${input.claimGuardResult.reversibilityStatus}`,
    );
    lines.push(
      `- **Heritability Claim:** ${input.claimGuardResult.heritabilityClaim}`,
    );
    lines.push("");

    if (input.claimGuardResult.persistenceStatus === "not_assessed") {
      lines.push(
        "> **Caveat:** The service refused to infer persistence of epigenomic changes because the design lacks repeated or recovery timepoints.",
      );
      lines.push("");
    }
    if (input.claimGuardResult.reversibilityStatus === "not_assessed") {
      lines.push(
        "> **Caveat:** The service refused to infer reversibility of epigenomic changes because the design lacks repeated or recovery timepoints.",
      );
      lines.push("");
    }
    if (input.claimGuardResult.heritabilityClaim === "none") {
      lines.push(
        "> **Caveat:** The service refused to infer heritability or transgenerational transmission because multigenerationalDesign is not explicitly true.",
      );
      lines.push("");
    }
  }

  // Warnings
  lines.push("## Warnings");
  lines.push("");
  renderQualificationWarnings(input, lines);
  lines.push("");

  // Exclusions
  lines.push("## Exclusions");
  lines.push("");
  if (exclusions.length === 0) {
    lines.push("No exclusions.");
  } else {
    for (const e of exclusions) {
      lines.push(`- ${e}`);
    }
  }
  lines.push("");

  // Interpretation Limits
  lines.push("## Interpretation Limits");
  lines.push("");
  lines.push(
    "1. This report does not infer causality between epigenomic changes and phenotypic outcomes.",
  );
  lines.push(
    "2. Dose-response modelling is performed by downstream Bioactivity-PoD MCP, not this service.",
  );
  lines.push(
    "3. Pathway roll-up is blocked for nearest-gene-only mappings.",
  );
  lines.push(
    "4. Persistence, reversibility, and heritability claims are guarded by design metadata and may be defaulted to 'not_assessed' or 'none'.",
  );
  lines.push("");

  // Refused Inferences
  lines.push("## Refused Inferences");
  lines.push("");
  if (refusedInferences.length === 0) {
    lines.push("No refused inferences.");
  } else {
    for (const r of refusedInferences) {
      lines.push(`- ${r}`);
    }
  }
  lines.push("");

  lines.push("---");
  lines.push("*End of report*");

  return lines.join("\n");
}
