import type { QcProfile } from "../contracts/qc.js";
import type { QualificationWarning } from "../contracts/qualification.js";

export interface QcReport {
  reportId: string;
  datasetId: string;
  generatedAt: string;
  profile: QcProfile;
  warnings: QualificationWarning[];
  conclusion: string;
}

/**
 * Generate a regulator-readable QC report.
 */
export function generateQcReport(
  datasetId: string,
  profile: QcProfile,
  warnings: QualificationWarning[],
): QcReport {
  const conclusion = profile.designAdequacyFlags.controlsPresent
    ? profile.missingnessRate <= 0.1
      ? "Dataset passes basic QC gates for downstream qualification."
      : "Dataset has elevated missingness; review before downstream use."
    : "Dataset lacks declared controls; fail-closed for dose-response modelling.";

  return {
    reportId: crypto.randomUUID(),
    datasetId,
    generatedAt: new Date().toISOString(),
    profile,
    warnings,
    conclusion,
  };
}
