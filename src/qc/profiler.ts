import { QcProfileSchema, type QcProfile } from "../contracts/qc.js";
import type { EpigenomicFeature } from "../contracts/features.js";
import type { ExperimentalDesign } from "../contracts/design.js";

export interface QcProfilerResult {
  profile: QcProfile;
  pass: boolean;
}

/**
 * Compute deterministic QC profile for an epigenomics dataset.
 */
export function profileQc(
  datasetId: string,
  features: EpigenomicFeature[],
  design: ExperimentalDesign,
): QcProfilerResult {
  const totalFeatures = features.length;
  let featuresWithMissing = 0;

  for (const f of features) {
    const values = Object.values(f.values);
    const missingCount = values.filter((v) => Number.isNaN(v) || v === null).length;
    if (missingCount > 0) featuresWithMissing++;
  }

  const missingnessRate = totalFeatures > 0 ? featuresWithMissing / totalFeatures : 0;

  const profile = QcProfileSchema.parse({
    datasetId,
    totalFeatures,
    featuresWithMissingValues: featuresWithMissing,
    missingnessRate,
    designAdequacyFlags: {
      sufficientReplicates: design.minReplicatesPerGroup >= 2,
      doseRangeDeclared: design.doseGroups.length >= 2,
      controlsPresent: design.hasControls || design.doseGroups.some((g) => g.doseValue === 0),
      batchStructureKnown: design.samples.some((s) => s.batchId !== undefined),
      speciesBuildDeclared: true,
    },
  });

  const pass =
    profile.missingnessRate <= 0.1 &&
    profile.designAdequacyFlags.sufficientReplicates &&
    profile.designAdequacyFlags.doseRangeDeclared &&
    profile.designAdequacyFlags.controlsPresent;

  return { profile, pass };
}
