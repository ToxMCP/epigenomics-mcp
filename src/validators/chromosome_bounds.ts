import { z } from "zod";
import type { AnnotationClient } from "../integrations/annotation_client.js";

// ---------------------------------------------------------------------------
// Frozen chromosome sizes (UCSC chromInfo, major assemblies only)
// ---------------------------------------------------------------------------

const HG38_SIZES: Readonly<Record<string, number>> = {
  chr1: 248956422,
  chr2: 242193529,
  chr3: 198295559,
  chr4: 190214555,
  chr5: 181538259,
  chr6: 170805979,
  chr7: 159345973,
  chr8: 145138636,
  chr9: 138394717,
  chr10: 133797422,
  chr11: 135086622,
  chr12: 133275309,
  chr13: 114364328,
  chr14: 107043718,
  chr15: 101991189,
  chr16: 90338345,
  chr17: 83257441,
  chr18: 80373285,
  chr19: 58617616,
  chr20: 64444167,
  chr21: 46709983,
  chr22: 50818468,
  chrX: 156040895,
  chrY: 57227415,
  chrM: 16569,
};

const HG19_SIZES: Readonly<Record<string, number>> = {
  chr1: 249250621,
  chr2: 243199373,
  chr3: 198022430,
  chr4: 191154276,
  chr5: 180915260,
  chr6: 171115067,
  chr7: 159138663,
  chr8: 146364022,
  chr9: 141213431,
  chr10: 135534747,
  chr11: 135006516,
  chr12: 133851895,
  chr13: 115169878,
  chr14: 107349540,
  chr15: 102531392,
  chr16: 90354753,
  chr17: 81195210,
  chr18: 78077248,
  chr19: 59128983,
  chr20: 63025520,
  chr21: 48129895,
  chr22: 51304566,
  chrX: 155270560,
  chrY: 59373566,
  chrM: 16571,
};

const MM10_SIZES: Readonly<Record<string, number>> = {
  chr1: 195471971,
  chr2: 182113224,
  chr3: 160039680,
  chr4: 156508116,
  chr5: 151834684,
  chr6: 149736546,
  chr7: 145441459,
  chr8: 129401213,
  chr9: 124595110,
  chr10: 130694993,
  chr11: 122082543,
  chr12: 120129022,
  chr13: 120421639,
  chr14: 124902244,
  chr15: 104043685,
  chr16: 98207768,
  chr17: 94987271,
  chr18: 90702639,
  chr19: 61431566,
  chrX: 171031299,
  chrY: 91744698,
  chrM: 16299,
};

const MM9_SIZES: Readonly<Record<string, number>> = {
  chr1: 197195432,
  chr2: 181748087,
  chr3: 159599783,
  chr4: 155630120,
  chr5: 152537259,
  chr6: 149517037,
  chr7: 152524553,
  chr8: 131738871,
  chr9: 124076172,
  chr10: 129993255,
  chr11: 121843856,
  chr12: 121257530,
  chr13: 120284312,
  chr14: 125194864,
  chr15: 103494974,
  chr16: 98319150,
  chr17: 95272651,
  chr18: 90772031,
  chr19: 61342430,
  chrX: 166650296,
  chrY: 15902555,
  chrM: 16302,
};

const MM39_SIZES: Readonly<Record<string, number>> = {
  chr1: 195154279,
  chr2: 182045439,
  chr3: 160039680,
  chr4: 156508116,
  chr5: 151753680,
  chr6: 149588044,
  chr7: 144995196,
  chr8: 130127694,
  chr9: 124359700,
  chr10: 130530862,
  chr11: 122014644,
  chr12: 120129022,
  chr13: 120421639,
  chr14: 124902244,
  chr15: 104043685,
  chr16: 98207768,
  chr17: 94987271,
  chr18: 90702639,
  chr19: 61420004,
  chrX: 169476592,
  chrY: 91455967,
  chrM: 16299,
};

const RN6_SIZES: Readonly<Record<string, number>> = {
  chr1: 282763074,
  chr2: 266435125,
  chr3: 171537068,
  chr4: 187126005,
  chr5: 173096209,
  chr6: 147636619,
  chr7: 143002779,
  chr8: 129041809,
  chr9: 113440130,
  chr10: 110718848,
  chr11: 81197504,
  chr12: 46294695,
  chr13: 111066128,
  chr14: 112194335,
  chr15: 109758686,
  chr16: 90238779,
  chr17: 97296396,
  chr18: 87333570,
  chr19: 59216772,
  chr20: 55268282,
  chrX: 159970021,
  chrY: 20274243,
  chrM: 16313,
};

const RN7_SIZES: Readonly<Record<string, number>> = {
  chr1: 267954042,
  chr2: 258207540,
  chr3: 173375984,
  chr4: 187972056,
  chr5: 175772099,
  chr6: 149603403,
  chr7: 144431168,
  chr8: 131738167,
  chr9: 114928760,
  chr10: 113744950,
  chr11: 85155652,
  chr12: 46771159,
  chr13: 111571696,
  chr14: 112958639,
  chr15: 109692580,
  chr16: 90843739,
  chr17: 97852489,
  chr18: 88359747,
  chr19: 60773175,
  chr20: 55860226,
  chrX: 161629489,
  chrY: 18860971,
  chrM: 16313,
};

const FROZEN_CHROMOSOME_SIZES: Readonly<
  Record<string, Readonly<Record<string, number>>>
> = {
  hg38: HG38_SIZES,
  GRCh38: HG38_SIZES,
  hg19: HG19_SIZES,
  GRCh37: HG19_SIZES,
  mm9: MM9_SIZES,
  mm10: MM10_SIZES,
  mm39: MM39_SIZES,
  rn6: RN6_SIZES,
  rn7: RN7_SIZES,
};

// ---------------------------------------------------------------------------
// Alias normalization
// ---------------------------------------------------------------------------

const ALIAS_TO_CANONICAL: Readonly<Map<string, string>> = new Map([
  ["1", "chr1"],
  ["2", "chr2"],
  ["3", "chr3"],
  ["4", "chr4"],
  ["5", "chr5"],
  ["6", "chr6"],
  ["7", "chr7"],
  ["8", "chr8"],
  ["9", "chr9"],
  ["10", "chr10"],
  ["11", "chr11"],
  ["12", "chr12"],
  ["13", "chr13"],
  ["14", "chr14"],
  ["15", "chr15"],
  ["16", "chr16"],
  ["17", "chr17"],
  ["18", "chr18"],
  ["19", "chr19"],
  ["20", "chr20"],
  ["21", "chr21"],
  ["22", "chr22"],
  ["X", "chrX"],
  ["Y", "chrY"],
  ["M", "chrM"],
  ["MT", "chrM"],
  ["chrMT", "chrM"],
]);

function normalizeChromosomeAlias(chrom: string): string | undefined {
  const canonical = ALIAS_TO_CANONICAL.get(chrom);
  if (canonical !== undefined) {
    return canonical;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const RegionExtractionSchema = z
  .object({
    featureId: z.string().min(1).optional(),
    measuredRegion: z
      .object({
        chrom: z.string().min(1),
        start: z.number().int(),
        end: z.number().int(),
        build: z.string().min(1),
        coordinateSystem: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChromosomeBoundsValidationOptions {
  /** Whether to normalize chromosome aliases (e.g. "1" → "chr1"). */
  allowAliasNormalization?: boolean;
  /** Annotation/Ontology MCP client for remote chromosome lookup. */
  annotationClient?: AnnotationClient;
  /** Whether to enforce interval bounds against chromosome length. */
  requireBoundsCheck?: boolean;
}

export interface AliasNormalizationRecord {
  featureId?: string;
  originalChrom: string;
  canonicalChrom: string;
}

export interface ChromosomeBoundsValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  aliasNormalizations: AliasNormalizationRecord[];
}

// ---------------------------------------------------------------------------
// Local lookup
// ---------------------------------------------------------------------------

function getChromosomeLengthLocal(
  build: string,
  chrom: string,
): number | undefined {
  const buildData = FROZEN_CHROMOSOME_SIZES[build];
  if (buildData === undefined) {
    return undefined;
  }
  return buildData[chrom];
}

// ---------------------------------------------------------------------------
// Per-feature validation
// ---------------------------------------------------------------------------

function validateBounds(
  featureId: string | undefined,
  chrom: string,
  start: number,
  end: number,
  chromLength: number,
  result: ChromosomeBoundsValidationResult,
): void {
  if (start < 0) {
    result.errors.push(
      `EPI009: Start coordinate ${start} is negative for feature ${featureId ?? "(unknown)"} (${chrom})`,
    );
    result.valid = false;
  }
  if (end > chromLength) {
    result.errors.push(
      `EPI009: End coordinate ${end} exceeds chromosome length (${chromLength}) for feature ${featureId ?? "(unknown)"} (${chrom})`,
    );
    result.valid = false;
  }
  if (end <= start) {
    result.errors.push(
      `EPI009: Invalid interval (end ${end} <= start ${start}) for feature ${featureId ?? "(unknown)"} (${chrom})`,
    );
    result.valid = false;
  }
}

function resolveChromosome(
  originalChrom: string,
  featureId: string | undefined,
  allowAliasNormalization: boolean,
  result: ChromosomeBoundsValidationResult,
): string {
  if (!allowAliasNormalization) {
    return originalChrom;
  }

  const canonical = normalizeChromosomeAlias(originalChrom);
  if (canonical !== undefined && canonical !== originalChrom) {
    result.aliasNormalizations.push({
      featureId,
      originalChrom,
      canonicalChrom: canonical,
    });
    result.warnings.push(
      `EPI009: Chromosome alias normalized for feature ${featureId ?? "(unknown)"}: ${originalChrom} → ${canonical}`,
    );
    return canonical;
  }

  return originalChrom;
}

// ---------------------------------------------------------------------------
// Synchronous validation (frozen snapshot only)
// ---------------------------------------------------------------------------

/**
 * Validate chromosome names and interval bounds using a frozen local snapshot.
 *
 * Rules (fail-closed):
 * - Chromosomes must exist in the frozen snapshot for the declared build.
 * - Intervals must satisfy start >= 0, end > start, and end <= chromosome length.
 * - Alias normalization is performed only when explicitly enabled; every
 *   normalization is recorded in aliasNormalizations and warned.
 * - Features without measuredRegion are skipped silently.
 * - Unknown builds or chromosomes produce EPI009 errors.
 */
export function validateChromosomeBounds(
  features: unknown[],
  options: ChromosomeBoundsValidationOptions = {},
): ChromosomeBoundsValidationResult {
  const allowAliasNormalization = options.allowAliasNormalization ?? false;
  const requireBoundsCheck = options.requireBoundsCheck ?? true;

  const result: ChromosomeBoundsValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    aliasNormalizations: [],
  };

  for (const raw of features) {
    const parseResult = RegionExtractionSchema.safeParse(raw);
    if (!parseResult.success) {
      continue;
    }

    const { featureId, measuredRegion } = parseResult.data;
    if (measuredRegion === undefined) {
      continue;
    }

    const { start, end, build, coordinateSystem } = measuredRegion;
    const chrom = resolveChromosome(
      measuredRegion.chrom,
      featureId,
      allowAliasNormalization,
      result,
    );

    const buildData = FROZEN_CHROMOSOME_SIZES[build];
    if (buildData === undefined) {
      result.errors.push(
        `EPI009: Build "${build}" not in frozen chromosome sizes; feature ${featureId ?? "(unknown)"} cannot be validated locally`,
      );
      result.valid = false;
      continue;
    }

    const chromLength = buildData[chrom];
    if (chromLength === undefined) {
      result.errors.push(
        `EPI009: Unknown chromosome "${chrom}" for build ${build} in feature ${featureId ?? "(unknown)"}`,
      );
      result.valid = false;
      continue;
    }

    if (requireBoundsCheck) {
      const boundsStart = coordinateSystem === "1-based-closed" ? start - 1 : start;
      validateBounds(featureId, chrom, boundsStart, end, chromLength, result);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Asynchronous validation (frozen snapshot + Annotation/Ontology MCP)
// ---------------------------------------------------------------------------

/**
 * Validate chromosome names and interval bounds using a frozen local snapshot,
 * with an optional Annotation/Ontology MCP client fallback.
 *
 * When the local snapshot lacks a build or chromosome, the annotation client
 * is queried (if provided).  If the client is unreachable or the chromosome is
 * still unknown, the validator fails closed with an EPI009 error.
 *
 * Lookups are cached per (build, chrom) to avoid redundant remote calls.
 */
export async function validateChromosomeBoundsAsync(
  features: unknown[],
  options: ChromosomeBoundsValidationOptions = {},
): Promise<ChromosomeBoundsValidationResult> {
  const allowAliasNormalization = options.allowAliasNormalization ?? false;
  const requireBoundsCheck = options.requireBoundsCheck ?? true;
  const annotationClient = options.annotationClient;

  const result: ChromosomeBoundsValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    aliasNormalizations: [],
  };

  const annotationCache = new Map<string, { valid: boolean; length?: number }>();

  for (const raw of features) {
    const parseResult = RegionExtractionSchema.safeParse(raw);
    if (!parseResult.success) {
      continue;
    }

    const { featureId, measuredRegion } = parseResult.data;
    if (measuredRegion === undefined) {
      continue;
    }

    const { start, end, build, coordinateSystem } = measuredRegion;
    const chrom = resolveChromosome(
      measuredRegion.chrom,
      featureId,
      allowAliasNormalization,
      result,
    );

    let chromLength = getChromosomeLengthLocal(build, chrom);

    if (chromLength === undefined && annotationClient !== undefined) {
      const cacheKey = `${build}:${chrom}`;
      let cached = annotationCache.get(cacheKey);
      if (cached === undefined) {
        try {
          const response = await annotationClient.validateChromosome({
            chrom,
            build,
          });
          cached = {
            valid: response.valid,
            length: response.length,
          };
        } catch {
          cached = { valid: false };
          result.warnings.push(
            `EPI009: Annotation/Ontology MCP lookup failed for ${cacheKey}; failing closed`,
          );
        }
        annotationCache.set(cacheKey, cached);
      }
      if (cached.valid && cached.length !== undefined) {
        chromLength = cached.length;
      }
    }

    if (chromLength === undefined) {
      result.errors.push(
        `EPI009: Unknown chromosome "${chrom}" for build ${build} in feature ${featureId ?? "(unknown)"}`,
      );
      result.valid = false;
      continue;
    }

    if (requireBoundsCheck) {
      const boundsStart = coordinateSystem === "1-based-closed" ? start - 1 : start;
      validateBounds(featureId, chrom, boundsStart, end, chromLength, result);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Exported helpers for consumers and tests
// ---------------------------------------------------------------------------

/**
 * Return the set of builds supported by the frozen chromosome snapshot.
 */
export function getFrozenBuilds(): string[] {
  return Object.keys(FROZEN_CHROMOSOME_SIZES);
}

/**
 * Return the chromosome names available in the frozen snapshot for a given build.
 */
export function getFrozenChromosomesForBuild(build: string): string[] | undefined {
  const buildData = FROZEN_CHROMOSOME_SIZES[build];
  if (buildData === undefined) {
    return undefined;
  }
  return Object.keys(buildData);
}
