import type { QualificationExplainability } from "../contracts/qualification.js";
import type { QualificationPolicy } from "./policy.js";

/**
 * Rule codes used by the qualification engine.
 */
export const RULE_CODES = {
  MISSING_BUILD: "RULE_001_MISSING_BUILD",
  INVALID_COORDINATES: "RULE_002_INVALID_COORDINATES",
  INSUFFICIENT_DESIGN: "RULE_003_INSUFFICIENT_DESIGN",
  INSUFFICIENT_REPLICATES: "RULE_004_INSUFFICIENT_REPLICATES",
  HIGH_MISSINGNESS: "RULE_005_HIGH_MISSINGNESS",
  NON_NUMERIC_RESPONSE: "RULE_006_NON_NUMERIC_RESPONSE",
  DOMINANT_CONFOUNDING: "RULE_007_DOMINANT_CONFOUNDING",
  MAPPING_AMBIGUITY: "RULE_008_MAPPING_AMBIGUITY",
  MAJOR_WARNINGS: "RULE_009_MAJOR_WARNINGS",
  ACCEPTED: "RULE_010_ACCEPTED",
} as const;

export type RuleCode = (typeof RULE_CODES)[keyof typeof RULE_CODES];

/**
 * Lookup of human-readable reason templates by rule code.
 *
 * Templates use named placeholders like {featureId} that are filled at
 * runtime.  All templates state what the system observed and which policy
 * threshold was applied; they do not make regulatory conclusions.
 */
const REASON_TEMPLATES: Record<
  RuleCode,
  {
    template: string;
    remediationHint?: string;
    reviewRequired: boolean;
    policyReference: string;
  }
> = {
  [RULE_CODES.MISSING_BUILD]: {
    template:
      "Feature {featureId} declares a measured region but the genome build is missing. Policy coordinate.requireGenomeBuild is {requireGenomeBuild}; the feature is excluded because the build cannot be verified.",
    remediationHint:
      "Add the genome build (e.g., GRCh38) to the measuredRegion metadata for this feature.",
    reviewRequired: true,
    policyReference: "coordinate.requireGenomeBuild",
  },
  [RULE_CODES.INVALID_COORDINATES]: {
    template:
      "Feature {featureId} declares genome build '{build}', which is not in the policy allowlist or mixed builds were detected. Policy coordinate.allowedGenomeBuilds controls permitted builds.",
    remediationHint:
      "Confirm the genome build identifier matches an allowed build, or update the policy allowlist if the build is valid.",
    reviewRequired: true,
    policyReference: "coordinate.allowedGenomeBuilds",
  },
  [RULE_CODES.INSUFFICIENT_DESIGN]: {
    template:
      "The canonical design-readiness assessment reports blocker(s): {designBlockers}. The design provides {totalDoseGroups} distinct dose levels ({nonZeroDoseGroups} non-zero); the policy minimum is {minTotalDoseGroups} total / {minNonZeroDoseGroups} non-zero. Feature {featureId} is excluded from dose-response modelling.",
    remediationHint:
      "Resolve the listed design blocker(s), then rerun design validation and feature qualification.",
    reviewRequired: true,
    policyReference: "designReadiness / doseGroup / replicate",
  },
  [RULE_CODES.INSUFFICIENT_REPLICATES]: {
    template:
      "Feature {featureId} is supported by {minBiologicalReplicates} biological replicate(s) per group, below the policy minimum of {minBiologicalReplicatesPerGroup}. Replicate adequacy is assessed per dose group.",
    remediationHint:
      "Increase biological replication, or set the n1BiologicalReplicatePolicy to 'review_required' if single-replicate groups must be retained.",
    reviewRequired: true,
    policyReference: "replicate.minBiologicalReplicatesPerGroup",
  },
  [RULE_CODES.HIGH_MISSINGNESS]: {
    template:
      "Feature {featureId} has {missingFraction}% missing values, exceeding the policy exclusion threshold of {exclusionThreshold}%. High missingness reduces reliability for dose-response modelling.",
    remediationHint:
      "Investigate sample-level missingness; consider imputation or exclusion of low-quality samples.",
    reviewRequired: true,
    policyReference: "missingness.exclusionThreshold",
  },
  [RULE_CODES.NON_NUMERIC_RESPONSE]: {
    template:
      "Feature {featureId} contains non-finite (infinite or NaN) response values. Policy requires finite numeric values for downstream dose-response modelling.",
    remediationHint:
      "Check upstream normalisation or batch-correction outputs for numeric overflows or division-by-zero artefacts.",
    reviewRequired: true,
    policyReference: "platform_numeric_validity",
  },
  [RULE_CODES.DOMINANT_CONFOUNDING]: {
    template:
      "Feature {featureId} is affected by confounding (observed level: {confoundingLevel}) that meets or exceeds the policy block level ({blockLevel}). The feature is downgraded to exploratory-only.",
    remediationHint:
      "Provide additional confounding-context metadata (cell composition, cytotoxicity, stress response, or differentiation drift) or adjust the confounding block level in policy.",
    reviewRequired: true,
    policyReference: "confounding.{confoundingType}BlockLevel",
  },
  [RULE_CODES.MAPPING_AMBIGUITY]: {
    template:
      "Feature {featureId} has mapping ambiguity detected. Policy requires unambiguous region-to-gene mapping for reliable target assignment.",
    remediationHint:
      "Review the mapping pipeline for this feature; consider using a higher-confidence mapping method or manual curation.",
    reviewRequired: true,
    policyReference: "mapping.allowedMappingMethods",
  },
  [RULE_CODES.MAJOR_WARNINGS]: {
    template:
      "Feature {featureId} passed all blocking rules but carries {warningCount} warning(s) (severity: warning or error). The feature is accepted with caveats.",
    remediationHint:
      "Review the attached warnings and address underlying data-quality or metadata issues where possible.",
    reviewRequired: false,
    policyReference: "warning_accumulation",
  },
  [RULE_CODES.ACCEPTED]: {
    template:
      "Feature {featureId} satisfies all policy thresholds and carries no blocking warnings. Accepted for downstream Bioactivity-PoD modelling.",
    reviewRequired: false,
    policyReference: "none",
  },
};

/**
 * Build a structured explainability record for a qualification decision.
 *
 * Fills the reason template with runtime values and includes remediation
 * hints where useful.  All policy choices are traceable to the supplied
 * QualificationPolicy.
 */
export function buildExplainability(
  ruleCode: RuleCode,
  featureId: string,
  policy: QualificationPolicy,
  context: {
    build?: string;
    totalDoseGroups?: number;
    nonZeroDoseGroups?: number;
    designBlockers?: string[];
    minBiologicalReplicates?: number;
    missingFraction?: number;
    confoundingLevel?: string;
    confoundingType?: string;
    blockLevel?: string;
    warningCount?: number;
  } = {},
): QualificationExplainability {
  const meta = REASON_TEMPLATES[ruleCode];

  let template = meta.template;
  template = template.replace(/{featureId}/g, featureId);
  template = template.replace(
    /{requireGenomeBuild}/g,
    String(policy.coordinate.requireGenomeBuild),
  );
  template = template.replace(/{build}/g, context.build ?? "unknown");
  template = template.replace(
    /{totalDoseGroups}/g,
    String(context.totalDoseGroups ?? "?"),
  );
  template = template.replace(
    /{nonZeroDoseGroups}/g,
    String(context.nonZeroDoseGroups ?? "?"),
  );
  template = template.replace(
    /{designBlockers}/g,
    context.designBlockers?.join(", ") ?? "unspecified_design_blocker",
  );
  template = template.replace(
    /{minTotalDoseGroups}/g,
    String(policy.doseGroup.minTotalDoseGroups),
  );
  template = template.replace(
    /{minNonZeroDoseGroups}/g,
    String(policy.doseGroup.minNonZeroDoseGroups),
  );
  template = template.replace(
    /{minBiologicalReplicates}/g,
    String(context.minBiologicalReplicates ?? "?"),
  );
  template = template.replace(
    /{minBiologicalReplicatesPerGroup}/g,
    String(policy.replicate.minBiologicalReplicatesPerGroup),
  );
  template = template.replace(
    /{missingFraction}/g,
    context.missingFraction !== undefined
      ? (context.missingFraction * 100).toFixed(1)
      : "?",
  );
  template = template.replace(
    /{exclusionThreshold}/g,
    (policy.missingness.exclusionThreshold * 100).toFixed(1),
  );
  template = template.replace(
    /{confoundingLevel}/g,
    context.confoundingLevel ?? "?",
  );
  template = template.replace(
    /{confoundingType}/g,
    context.confoundingType ?? "?",
  );
  template = template.replace(
    /{blockLevel}/g,
    context.blockLevel ?? "?",
  );
  template = template.replace(
    /{warningCount}/g,
    String(context.warningCount ?? "?"),
  );

  const thresholdValue =
    ruleCode === RULE_CODES.HIGH_MISSINGNESS
      ? `${(policy.missingness.exclusionThreshold * 100).toFixed(1)}%`
      : ruleCode === RULE_CODES.INSUFFICIENT_DESIGN
        ? `${policy.doseGroup.minTotalDoseGroups} total / ${policy.doseGroup.minNonZeroDoseGroups} non-zero`
        : ruleCode === RULE_CODES.INSUFFICIENT_REPLICATES
          ? String(policy.replicate.minBiologicalReplicatesPerGroup)
          : ruleCode === RULE_CODES.DOMINANT_CONFOUNDING
            ? context.blockLevel ?? undefined
            : undefined;

  const observedValue =
    ruleCode === RULE_CODES.HIGH_MISSINGNESS
      ? context.missingFraction !== undefined
        ? `${(context.missingFraction * 100).toFixed(1)}%`
        : undefined
      : ruleCode === RULE_CODES.INSUFFICIENT_DESIGN
        ? `${context.totalDoseGroups ?? "?"} total / ${context.nonZeroDoseGroups ?? "?"} non-zero; blockers=${context.designBlockers?.join(", ") ?? "unspecified"}`
        : ruleCode === RULE_CODES.INSUFFICIENT_REPLICATES
          ? String(context.minBiologicalReplicates ?? "?")
          : ruleCode === RULE_CODES.DOMINANT_CONFOUNDING
            ? context.confoundingLevel ?? undefined
            : ruleCode === RULE_CODES.MAJOR_WARNINGS
              ? String(context.warningCount ?? "?")
              : undefined;

  return {
    ruleCode,
    reasonTemplate: template,
    ...(meta.remediationHint ? { remediationHint: meta.remediationHint } : {}),
    reviewRequired: meta.reviewRequired,
    policyReference: meta.policyReference,
    ...(thresholdValue !== undefined ? { thresholdValue } : {}),
    ...(observedValue !== undefined ? { observedValue } : {}),
  };
}

/**
 * Summarise explainability across all per-feature results.
 *
 * Returns a compact summary suitable for top-level inclusion in a
 * qualification report: unique rule codes, counts, and whether any
 * feature requires human review.
 */
export function summariseExplainability(
  explainabilities: QualificationExplainability[],
): {
  uniqueRuleCodes: string[];
  ruleCodeCounts: Record<string, number>;
  reviewRequiredCount: number;
  featuresWithRemediation: number;
} {
  const ruleCodeCounts: Record<string, number> = {};
  let reviewRequiredCount = 0;
  let featuresWithRemediation = 0;

  for (const ex of explainabilities) {
    ruleCodeCounts[ex.ruleCode] = (ruleCodeCounts[ex.ruleCode] || 0) + 1;
    if (ex.reviewRequired) {
      reviewRequiredCount += 1;
    }
    if (ex.remediationHint) {
      featuresWithRemediation += 1;
    }
  }

  return {
    uniqueRuleCodes: Object.keys(ruleCodeCounts).sort(),
    ruleCodeCounts,
    reviewRequiredCount,
    featuresWithRemediation,
  };
}
