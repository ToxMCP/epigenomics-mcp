import { z } from "zod";
import { readTableFile } from "./csv_reader.js";
import { ReadTableOptionsSchema } from "./csv_reader.js";
import {
  ExperimentalDesignSchema,
  type ExperimentalDesign,
} from "../contracts/design.js";

/**
 * Supported replicate type values.
 */
export const ReplicateTypeInputSchema = z.enum([
  "biological",
  "bio",
  "technical",
  "tech",
]);

export type ReplicateTypeInput = z.infer<typeof ReplicateTypeInputSchema>;

/**
 * Column mapping for design table ingestion.
 * Maps canonical field names to actual column names in the input file.
 */
export const DesignColumnMappingSchema = z
  .object({
    sampleId: z.string().min(1).default("sample_id"),
    groupId: z.string().min(1).default("group_id"),
    doseValue: z.string().min(1).default("dose_value"),
    doseUnit: z.string().min(1).default("dose_unit"),
    replicateType: z.string().min(1).default("replicate_type"),
    batchId: z.string().min(1).default("batch_id"),
    timepoint: z.string().min(1).default("timepoint"),
    treatment: z.string().min(1).default("treatment"),
    controlFlag: z.string().min(1).default("control_flag"),
  })
  .strict();

export type DesignColumnMapping = z.infer<typeof DesignColumnMappingSchema>;

/**
 * Options for reading a design table.
 */
export const ReadDesignOptionsSchema = z
  .object({
    designId: z.string().min(1).describe("Unique design identifier"),
    studyId: z.string().min(1).optional().describe("Optional study identifier"),
    species: z.string().min(1).describe("Species name"),
    columnMapping: DesignColumnMappingSchema.partial()
      .optional()
      .describe("Explicit column name overrides"),
    readTableOptions: ReadTableOptionsSchema.partial()
      .optional()
      .describe("Options passed to the underlying table reader"),
  })
  .strict();

export type ReadDesignOptions = z.input<typeof ReadDesignOptionsSchema>;

/**
 * Result of reading a design table.
 */
export const ReadDesignResultSchema = z
  .object({
    success: z.boolean(),
    design: ExperimentalDesignSchema.optional(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export type ReadDesignResult = z.infer<typeof ReadDesignResultSchema>;

/**
 * Parse a string value into a boolean control flag.
 * Supports common representations. Returns null for unrecognised values.
 */
function parseBooleanFlag(value: string | undefined): boolean | null {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "" ||
    normalized === "false" ||
    normalized === "no" ||
    normalized === "0" ||
    normalized === "treatment"
  ) {
    return false;
  }
  if (
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "1" ||
    normalized === "control" ||
    normalized === "ctrl"
  ) {
    return true;
  }
  return null;
}

/**
 * Parse a string value into a finite number.
 * Returns null for empty or non-numeric values.
 */
function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/**
 * Normalise a replicate type input string to the canonical enum value.
 * Returns null for unrecognised values.
 */
function normaliseReplicateType(
  value: string | undefined,
): "biological" | "technical" | undefined | null {
  if (value === undefined || value.trim() === "") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "biological" || normalized === "bio") return "biological";
  if (normalized === "technical" || normalized === "tech") return "technical";
  return null;
}

interface ParsedSample {
  sampleId: string;
  doseGroupId: string;
  replicateIndex: number;
  replicateType?: "biological" | "technical";
  batchId?: string;
  controlFlag: boolean;
  treatment?: string;
  species: string;
}

interface DoseGroupKey {
  doseGroupId: string;
  doseValue: number;
  doseUnit: string;
  timepointHours?: number;
}

/**
 * Read a flat sample/design table and convert it into an ExperimentalDesign contract.
 *
 * Responsibilities:
 * - Parse CSV/TSV via readTableFile
 * - Map columns using explicit or default column names
 * - Validate required fields (sample_id, group_id, dose_value, dose_unit)
 * - Validate replicate_type against supported enum values
 * - Detect duplicate sample_ids
 * - Derive dose groups from unique group_id combinations
 * - Compute minReplicatesPerGroup and hasControls
 * - Fail closed: return errors, never throw
 */
export function readDesignTable(
  filePath: string,
  options: ReadDesignOptions,
): ReadDesignResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate options schema
  const optionsResult = ReadDesignOptionsSchema.safeParse(options);
  if (!optionsResult.success) {
    for (const issue of optionsResult.error.issues) {
      errors.push(`options.${issue.path.join(".")}: ${issue.message}`);
    }
    return { success: false, errors, warnings };
  }

  const opts = optionsResult.data;

  // Merge explicit column mapping with defaults
  const defaultMapping = DesignColumnMappingSchema.parse({});
  const mapping: DesignColumnMapping = {
    ...defaultMapping,
    ...opts.columnMapping,
  };

  // Read underlying table
  const tableResult = readTableFile(filePath, opts.readTableOptions ?? {});
  if (!tableResult.success) {
    errors.push(...tableResult.errors);
    warnings.push(...tableResult.warnings);
    return { success: false, errors, warnings };
  }
  warnings.push(...tableResult.warnings);

  const rawRows = tableResult.rows;
  if (rawRows.length === 0) {
    errors.push("Design table contains no data rows");
    return { success: false, errors, warnings };
  }

  // Verify required columns are present
  const requiredHeaders = [
    mapping.sampleId,
    mapping.groupId,
    mapping.doseValue,
    mapping.doseUnit,
  ];
  const missingHeaders = requiredHeaders.filter(
    (h) => !tableResult.headers.includes(h),
  );
  if (missingHeaders.length > 0) {
    errors.push(`Missing required column(s): ${missingHeaders.join(", ")}`);
    return { success: false, errors, warnings };
  }

  const sampleIdsSeen = new Set<string>();
  const samples: ParsedSample[] = [];
  const doseGroupMap = new Map<string, DoseGroupKey>();

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNum = i + 2; // line number in file (1-based, header = row 1)

    // sampleId — required
    const sampleId = row[mapping.sampleId]?.trim();
    if (!sampleId) {
      errors.push(`Row ${rowNum}: missing sample_id`);
      continue;
    }
    if (sampleIdsSeen.has(sampleId)) {
      errors.push(`Row ${rowNum}: duplicate sample_id '${sampleId}'`);
      continue;
    }
    sampleIdsSeen.add(sampleId);

    // groupId — required
    const groupId = row[mapping.groupId]?.trim();
    if (!groupId) {
      errors.push(`Row ${rowNum}: missing group_id`);
      continue;
    }

    // doseValue — required, must be finite number
    const doseValue = parseNumber(row[mapping.doseValue]);
    if (doseValue === null) {
      errors.push(`Row ${rowNum}: invalid or missing dose_value`);
      continue;
    }

    // doseUnit — required
    const doseUnit = row[mapping.doseUnit]?.trim();
    if (!doseUnit) {
      errors.push(`Row ${rowNum}: missing dose_unit`);
      continue;
    }

    // timepoint — optional, must be finite number if present
    const timepointRaw = row[mapping.timepoint];
    let timepointHours: number | undefined;
    if (timepointRaw !== undefined && timepointRaw.trim() !== "") {
      const parsed = parseNumber(timepointRaw);
      if (parsed === null) {
        errors.push(`Row ${rowNum}: invalid timepoint`);
        continue;
      }
      timepointHours = parsed;
    }

    // replicateType — optional, validated against enum
    const replicateTypeRaw = row[mapping.replicateType];
    const replicateType = normaliseReplicateType(replicateTypeRaw);
    if (replicateType === null) {
      errors.push(
        `Row ${rowNum}: invalid replicate_type '${replicateTypeRaw}'`,
      );
      continue;
    }

    // controlFlag — optional, validated against boolean representations
    const controlFlagRaw = row[mapping.controlFlag];
    let controlFlag = false;
    if (controlFlagRaw !== undefined) {
      const parsed = parseBooleanFlag(controlFlagRaw);
      if (parsed === null) {
        errors.push(`Row ${rowNum}: invalid control_flag '${controlFlagRaw}'`);
        continue;
      }
      controlFlag = parsed;
    }

    // batchId — optional
    const batchId = row[mapping.batchId]?.trim();

    // treatment — optional
    const treatment = row[mapping.treatment]?.trim();

    // Build or update dose group
    const groupKey = JSON.stringify({
      groupId,
      doseValue,
      doseUnit,
      timepointHours,
    });
    if (!doseGroupMap.has(groupKey)) {
      doseGroupMap.set(groupKey, {
        doseGroupId: groupId,
        doseValue,
        doseUnit,
        ...(timepointHours !== undefined ? { timepointHours } : {}),
      });
    }

    // replicateIndex = count of already-included samples in this group
    const groupSampleCount = samples.filter(
      (s) => s.doseGroupId === groupId,
    ).length;

    samples.push({
      sampleId,
      doseGroupId: groupId,
      replicateIndex: groupSampleCount,
      ...(replicateType !== undefined ? { replicateType } : {}),
      ...(batchId !== undefined && batchId !== "" ? { batchId } : {}),
      controlFlag,
      ...(treatment !== undefined && treatment !== "" ? { treatment } : {}),
      species: opts.species,
    });
  }

  if (samples.length === 0) {
    errors.push("No valid samples could be parsed from the design table");
    return { success: false, errors, warnings };
  }

  if (doseGroupMap.size === 0) {
    errors.push("No valid dose groups could be derived from the design table");
    return { success: false, errors, warnings };
  }

  // Compute minReplicatesPerGroup across all dose groups
  const replicateCounts = new Map<string, number>();
  for (const sample of samples) {
    replicateCounts.set(
      sample.doseGroupId,
      (replicateCounts.get(sample.doseGroupId) ?? 0) + 1,
    );
  }
  const minReplicatesPerGroup = Math.min(...replicateCounts.values());

  const hasControls =
    samples.some((s) => s.controlFlag) ||
    Array.from(doseGroupMap.values()).some((g) => g.doseValue === 0);

  const design: ExperimentalDesign = {
    designId: opts.designId,
    ...(opts.studyId ? { studyId: opts.studyId } : {}),
    species: opts.species,
    doseGroups: Array.from(doseGroupMap.values()),
    samples: samples.map((s) => ({
      sampleId: s.sampleId,
      doseGroupId: s.doseGroupId,
      replicateIndex: s.replicateIndex,
      ...(s.replicateType !== undefined ? { replicateType: s.replicateType } : {}),
      species: s.species,
      ...(s.batchId !== undefined ? { batchId: s.batchId } : {}),
      controlFlag: s.controlFlag,
      ...(s.treatment !== undefined ? { treatment: s.treatment } : {}),
    })),
    hasControls,
    minReplicatesPerGroup,
  };

  // Validate against ExperimentalDesignSchema
  const schemaResult = ExperimentalDesignSchema.safeParse(design);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    return { success: false, errors, warnings };
  }

  return {
    success: errors.length === 0,
    design: schemaResult.data,
    errors,
    warnings,
  };
}
