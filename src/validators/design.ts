import { ExperimentalDesignSchema } from "../contracts/design.js";

export interface DesignValidationResult {
  valid: boolean;
  schemaValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate an experimental design object for dose-response readiness.
 * Fails closed on schema violations.
 */
export function validateDesign(design: unknown): DesignValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parseResult = ExperimentalDesignSchema.safeParse(design);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    return { valid: false, schemaValid: false, errors, warnings };
  }

  const d = parseResult.data;

  // Replicate adequacy
  if (d.minReplicatesPerGroup < 2) {
    warnings.push(
      "minReplicatesPerGroup is fewer than 2; statistical power may be limited",
    );
  }

  // Dose monotonicity check
  const doses = d.doseGroups.map((g) => g.doseValue).sort((a, b) => a - b);
  const uniqueDoses = new Set(doses);
  if (uniqueDoses.size < 2) {
    errors.push("At least two distinct dose levels are required");
  }

  // Sample-to-dose-group linkage
  const groupIds = new Set(d.doseGroups.map((g) => g.doseGroupId));
  for (const sample of d.samples) {
    if (!groupIds.has(sample.doseGroupId)) {
      errors.push(
        `Sample ${sample.sampleId} references unknown doseGroupId ${sample.doseGroupId}`,
      );
    }
  }

  // Control presence
  if (!d.hasControls && !d.doseGroups.some((g) => g.doseValue === 0)) {
    errors.push("Design must include controls or a zero-dose group");
  }

  return { valid: errors.length === 0, schemaValid: true, errors, warnings };
}
