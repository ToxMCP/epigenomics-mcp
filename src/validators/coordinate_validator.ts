import { z } from "zod";

/**
 * Supported source coordinate system declarations.
 */
export const SourceCoordinateSystemSchema = z.enum([
  "ucsc_bed_0based_half_open",
  "gff_gtf_1based_closed",
  "platform_native_probe",
  "no_coordinates_feature_id_only",
]);

export type SourceCoordinateSystem = z.infer<typeof SourceCoordinateSystemSchema>;

/**
 * Coordinate system declaration attached to a feature.
 *
 * Uses a loose string for declaredSystem so that the validator can emit
 * structured EPI002 errors for unsupported values rather than failing at
 * the schema boundary.
 */
export const CoordinateSystemDeclarationSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    featureClass: z.string().min(1).describe("Feature class"),
    declaredSystem: z.string().optional().describe(
      "Declared source coordinate system",
    ),
  })
  .strict();

export type CoordinateSystemDeclaration = z.infer<
  typeof CoordinateSystemDeclarationSchema
>;

export interface CoordinateSystemValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Feature classes that inherently bear genomic regions.
 * These require an explicit coordinate system declaration.
 */
const REGION_BEARING_FEATURE_CLASSES: readonly string[] = [
  "atac_peak",
  "chip_peak_narrow",
  "chip_peak_broad",
  "histone_mark_peak",
  "chromatin_interaction",
  "dmr",
  "differential_methylated_region",
];

/**
 * Determine whether a feature class is region-bearing.
 */
export function isRegionBearingFeatureClass(featureClass: string): boolean {
  return REGION_BEARING_FEATURE_CLASSES.includes(featureClass);
}

/**
 * Validate coordinate system declarations for a set of features.
 *
 * Rules:
 * - Region-bearing features must declare a coordinate system.
 * - Region-bearing features must not declare "no_coordinates_feature_id_only".
 * - Declared systems must be from the supported enum.
 *
 * Fail-closed: any violation produces an EPI002 error.
 */
export function validateCoordinateSystemDeclarations(
  declarations: unknown[],
): CoordinateSystemValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const raw of declarations) {
    const parseResult = CoordinateSystemDeclarationSchema.safeParse(raw);
    if (!parseResult.success) {
      for (const issue of parseResult.error.issues) {
        errors.push(`${issue.path.join(".")}: ${issue.message}`);
      }
      continue;
    }

    const decl = parseResult.data;

    if (isRegionBearingFeatureClass(decl.featureClass)) {
      if (!decl.declaredSystem) {
        errors.push(
          `EPI002: Feature ${decl.featureId} (${decl.featureClass}) is region-bearing but has no coordinate system declaration`,
        );
      } else if (decl.declaredSystem === "no_coordinates_feature_id_only") {
        errors.push(
          `EPI002: Feature ${decl.featureId} (${decl.featureClass}) is region-bearing but declares no_coordinates_feature_id_only`,
        );
      }
    }

    // Validate that the declared system is supported (schema already enforces this,
    // but we keep an explicit guard for forward compatibility / custom parsers).
    if (decl.declaredSystem) {
      const systemResult = SourceCoordinateSystemSchema.safeParse(
        decl.declaredSystem,
      );
      if (!systemResult.success) {
        errors.push(
          `EPI002: Feature ${decl.featureId} declares unsupported coordinate system ${decl.declaredSystem}`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
