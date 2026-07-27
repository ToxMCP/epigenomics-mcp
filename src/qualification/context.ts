import type {
  CellCompositionProfile,
  CellCompositionConfoundingResult,
} from "../qc/cell_composition.js";
import { classifyCellCompositionConfounding } from "../qc/cell_composition.js";
import type {
  CytotoxicityProfile,
  CytotoxicityConfoundingResult,
} from "../qc/cytotoxicity.js";
import { classifyCytotoxicityConfounding } from "../qc/cytotoxicity.js";
import type { QualificationWarning } from "../contracts/qualification.js";

export interface QualificationContext {
  cellCompositionResult?: CellCompositionConfoundingResult;
  cytotoxicityResult?: CytotoxicityConfoundingResult;
}

export interface QualificationProfileInputs {
  cellCompositionProfile?: CellCompositionProfile;
  cytotoxicityProfile?: CytotoxicityProfile;
}

function mergeWarnings(
  profileWarnings: QualificationWarning[],
  classificationWarnings: QualificationWarning[],
): QualificationWarning[] {
  const merged = new Map<string, QualificationWarning>();
  for (const warning of [...profileWarnings, ...classificationWarnings]) {
    const key = [
      warning.warningCode,
      warning.category,
      warning.severity,
      warning.message,
    ].join("|");
    if (!merged.has(key)) {
      merged.set(key, warning);
    }
  }
  return [...merged.values()];
}

/**
 * Convert outputs from the context-ingestion tools into the assessments
 * consumed by qualification. Ingestion warnings are retained alongside the
 * deterministic classification result.
 */
export function qualificationContextFromProfiles(
  profiles: QualificationProfileInputs,
): QualificationContext {
  const context: QualificationContext = {};

  if (profiles.cellCompositionProfile) {
    const classified = classifyCellCompositionConfounding(
      profiles.cellCompositionProfile,
    );
    context.cellCompositionResult = {
      ...classified,
      warnings: mergeWarnings(
        profiles.cellCompositionProfile.warnings,
        classified.warnings,
      ),
    };
  }

  if (profiles.cytotoxicityProfile) {
    const classified = classifyCytotoxicityConfounding(
      profiles.cytotoxicityProfile,
    );
    context.cytotoxicityResult = {
      ...classified,
      warnings: mergeWarnings(
        profiles.cytotoxicityProfile.warnings,
        classified.warnings,
      ),
    };
  }

  return context;
}
