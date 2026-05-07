import type {
  ExperimentalDesign,
  PersistenceStatus,
  ReversibilityStatus,
  HeritabilityClaim,
} from "../contracts/design.js";
import type { QualificationWarning } from "../contracts/qualification.js";

/**
 * Result of applying temporal and inheritance claim guards to a design.
 */
export interface ClaimGuardResult {
  /** Guarded persistence status (may be defaulted to not_assessed). */
  persistenceStatus: PersistenceStatus;
  /** Guarded reversibility status (may be defaulted to not_assessed). */
  reversibilityStatus: ReversibilityStatus;
  /** Guarded heritability claim (may be stripped to none). */
  heritabilityClaim: HeritabilityClaim;
  /** Warnings emitted during guarding (EPIW009, EPIW010). */
  warnings: QualificationWarning[];
}

function buildWarning(
  warningCode: string,
  message: string,
  category: QualificationWarning["category"],
  blocksDownstream: boolean,
): QualificationWarning {
  return {
    warningCode,
    severity: "warning",
    message,
    category,
    blocksDownstream,
  };
}

/**
 * Determine whether a design includes repeated or recovery timepoints.
 *
 * A design is considered to have repeated/recovery timepoints when
 * dose groups declare more than one distinct timepointHours value.
 */
function hasRepeatedOrRecoveryTimepoints(design: ExperimentalDesign): boolean {
  const timepoints = new Set<number | undefined>();
  for (const dg of design.doseGroups) {
    timepoints.add(dg.timepointHours);
  }
  // More than one distinct timepoint (including undefined) indicates
  // a repeated-measures or recovery design.
  return timepoints.size > 1;
}

/**
 * Guard temporal and inheritance claims using fail-closed rules.
 *
 * Rules:
 * 1. persistence_status defaults to "not_assessed" unless repeated/recovery
 *    timepoints are present.  An explicit claim without supporting timepoints
 *    is overridden and EPIW009 is emitted.
 * 2. reversibility_status defaults to "not_assessed" unless repeated/recovery
 *    timepoints are present.  An explicit claim without supporting timepoints
 *    is overridden and EPIW009 is emitted.
 * 3. heritabilityClaim is stripped to "none" unless
 *    multigenerationalDesign === true.  An explicit heritable/transgenerational
 *    claim without supporting metadata is overridden and EPIW010 is emitted.
 *
 * Scientific assumptions visible in outputs:
 * - Single-timepoint designs cannot support persistence/reversibility claims
 *   because there is no post-exposure or recovery observation.
 * - Germline/multigenerational design metadata must be explicitly declared
 *   before heritability claims are allowed to propagate.
 */
export function guardClaims(design: ExperimentalDesign): ClaimGuardResult {
  const warnings: QualificationWarning[] = [];

  const hasTimepoints = hasRepeatedOrRecoveryTimepoints(design);

  // ── Persistence guard ──
  let persistenceStatus: PersistenceStatus = design.persistenceStatus ?? "not_assessed";
  if (!hasTimepoints && persistenceStatus !== "not_assessed") {
    warnings.push(
      buildWarning(
        "EPIW009",
        `persistence_status defaulted from "${persistenceStatus}" to "not_assessed" because design lacks repeated or recovery timepoints`,
        "time_dependence",
        false,
      ),
    );
    persistenceStatus = "not_assessed";
  }

  // ── Reversibility guard ──
  let reversibilityStatus: ReversibilityStatus = design.reversibilityStatus ?? "not_assessed";
  if (!hasTimepoints && reversibilityStatus !== "not_assessed") {
    warnings.push(
      buildWarning(
        "EPIW009",
        `reversibility_status defaulted from "${reversibilityStatus}" to "not_assessed" because design lacks repeated or recovery timepoints`,
        "time_dependence",
        false,
      ),
    );
    reversibilityStatus = "not_assessed";
  }

  // ── Heritability guard ──
  let heritabilityClaim: HeritabilityClaim = design.heritabilityClaim ?? "none";
  const supportsHeritability = design.multigenerationalDesign === true;
  if (!supportsHeritability && heritabilityClaim !== "none") {
    warnings.push(
      buildWarning(
        "EPIW010",
        `heritability_claim stripped from "${heritabilityClaim}" to "none" because multigenerationalDesign is not explicitly true`,
        "missing_metadata",
        true,
      ),
    );
    heritabilityClaim = "none";
  }

  return {
    persistenceStatus,
    reversibilityStatus,
    heritabilityClaim,
    warnings,
  };
}
