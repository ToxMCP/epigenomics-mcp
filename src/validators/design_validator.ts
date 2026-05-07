import {
  ExperimentalDesignSchema,
  type ExperimentalDesign,
  type DoseGroup,
  type SampleMetadata,
} from "../contracts/design.js";

/**
 * Options for control-and-dose-axis validation.
 */
export interface ValidateControlAndDoseOptions {
  /** Explicit control group identifier. If omitted, exactly one control group must be inferable. */
  controlGroupId?: string;
  /** Provenance declaration when dose groups use mixed units. */
  normalisationProvenance?: string;
  /** v0.1 policy for multi-timepoint designs: reject (default) or split. */
  multiTimepointPolicy?: "split" | "reject";
}

/**
 * Result of control-and-dose-axis validation.
 */
export interface ControlAndDoseValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Dose groups sorted deterministically by doseValue ascending, then doseGroupId lexicographically. */
  orderedDoseGroups: DoseGroup[];
  /** The control group that was explicitly provided or inferred. */
  identifiedControlGroupId?: string;
  /** Per-timepoint designs when multiTimepointPolicy is "split". */
  splitDesigns?: ExperimentalDesign[];
}

/**
 * Determine whether a dose group qualifies as a control group.
 *
 * A group is a control group when either:
 * - Its doseValue is exactly 0, OR
 * - Every sample assigned to it has controlFlag === true.
 */
function isControlGroup(
  doseGroup: DoseGroup,
  samples: SampleMetadata[],
): boolean {
  if (doseGroup.doseValue === 0) return true;
  const groupSamples = samples.filter(
    (s) => s.doseGroupId === doseGroup.doseGroupId,
  );
  if (groupSamples.length > 0 && groupSamples.every((s) => s.controlFlag))
    return true;
  return false;
}

/**
 * Check control-group constraints for a single design (original or split).
 */
function checkControlGroup(
  design: ExperimentalDesign,
  controlGroupId: string | undefined,
  errors: string[],
): string | undefined {
  const controlGroupIds = design.doseGroups
    .filter((g) => isControlGroup(g, design.samples))
    .map((g) => g.doseGroupId);

  if (controlGroupId) {
    const targetGroup = design.doseGroups.find(
      (g) => g.doseGroupId === controlGroupId,
    );
    if (!targetGroup) {
      errors.push(
        `Explicit controlGroupId '${controlGroupId}' does not match any dose group`,
      );
      return undefined;
    }
    if (!isControlGroup(targetGroup, design.samples)) {
      errors.push(
        `Explicit controlGroupId '${controlGroupId}' does not identify a control group (doseValue !== 0 and not all samples have controlFlag=true)`,
      );
      return undefined;
    }
    return controlGroupId;
  }

  if (controlGroupIds.length === 0) {
    errors.push(
      "No control group detected; provide controlGroupId or include a zero-dose/control-flagged group",
    );
    return undefined;
  }
  if (controlGroupIds.length > 1) {
    errors.push(
      `Multiple control groups detected (${controlGroupIds.join(", ")}); provide an explicit controlGroupId`,
    );
    return undefined;
  }
  return controlGroupIds[0];
}

/**
 * Validate the control and dose axis of an experimental design.
 *
 * Rules (fail-closed):
 * - Either an explicit controlGroupId is supplied, or exactly one control group
 *   can be inferred from the design (per timepoint after splitting).
 * - Every dose group must declare a non-empty doseUnit.
 * - Mixed dose units are rejected unless normalisationProvenance is provided.
 * - Dose groups are returned in deterministic ascending order by doseValue.
 * - Multi-timepoint designs are rejected under v0.1 default policy;
 *   setting multiTimepointPolicy to "split" produces one design per timepoint.
 */
export function validateControlAndDoseAxis(
  design: unknown,
  options: ValidateControlAndDoseOptions = {},
): ControlAndDoseValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Pre-schema validation: doseUnit presence ---
  if (design !== null && typeof design === "object" && !Array.isArray(design)) {
    const raw = design as Record<string, unknown>;
    if (Array.isArray(raw.doseGroups)) {
      for (let i = 0; i < raw.doseGroups.length; i++) {
        const dg = raw.doseGroups[i];
        if (dg !== null && typeof dg === "object" && !Array.isArray(dg)) {
          const rawDg = dg as Record<string, unknown>;
          const unit = rawDg.doseUnit;
          if (
            unit === undefined ||
            unit === null ||
            (typeof unit === "string" && unit.trim() === "")
          ) {
            errors.push(
              `Dose group index ${i} has missing or empty doseUnit`,
            );
          }
        }
      }
    }
  }

  // Schema validation
  const parseResult = ExperimentalDesignSchema.safeParse(design);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    return { valid: false, errors, warnings, orderedDoseGroups: [] };
  }

  const d = parseResult.data;

  // Deterministic ordering: doseValue ascending, then doseGroupId lexicographic
  const orderedDoseGroups = [...d.doseGroups].sort((a, b) => {
    if (a.doseValue !== b.doseValue) {
      return a.doseValue - b.doseValue;
    }
    return a.doseGroupId.localeCompare(b.doseGroupId);
  });

  // --- Dose unit validation (mixed units) ---
  const uniqueUnits = new Set(
    orderedDoseGroups
      .map((g) => g.doseUnit?.trim())
      .filter((u): u is string => !!u),
  );
  if (uniqueUnits.size > 1) {
    if (
      !options.normalisationProvenance ||
      options.normalisationProvenance.trim() === ""
    ) {
      errors.push(
        `Mixed dose units (${Array.from(uniqueUnits).join(", ")}) require declared normalisation provenance`,
      );
    } else {
      warnings.push(
        `Mixed dose units normalised per declared provenance: ${options.normalisationProvenance}`,
      );
    }
  }

  // --- Multi-timepoint validation (v0.1 policy) ---
  const timepointSet = new Set<number | undefined>();
  for (const dg of d.doseGroups) {
    timepointSet.add(dg.timepointHours);
  }

  let splitDesigns: ExperimentalDesign[] | undefined;
  let identifiedControlGroupId: string | undefined;

  if (timepointSet.size > 1) {
    const policy = options.multiTimepointPolicy ?? "reject";
    if (policy === "reject") {
      const tpList = Array.from(timepointSet)
        .map((t) => (t === undefined ? "undefined" : `${t}h`))
        .join(", ");
      errors.push(
        `Multi-timepoint design detected (${tpList}); v0.1 requires single-timepoint. Set multiTimepointPolicy to 'split' to allow per-timepoint splitting`,
      );
    } else {
      const sortedTimepoints = Array.from(timepointSet).sort((a, b) => {
        if (a === undefined && b === undefined) return 0;
        if (a === undefined) return 1;
        if (b === undefined) return -1;
        return a - b;
      });

      for (const tp of sortedTimepoints) {
        const tpDoseGroups = orderedDoseGroups.filter(
          (dg) => dg.timepointHours === tp,
        );
        const tpGroupIds = new Set(tpDoseGroups.map((dg) => dg.doseGroupId));
        const tpSamples = d.samples.filter((s) => tpGroupIds.has(s.doseGroupId));

        if (tpSamples.length === 0) {
          errors.push(
            `Timepoint ${tp === undefined ? "undefined" : `${tp}h`} has no associated samples after split`,
          );
          continue;
        }

        const tpHasControls =
          tpSamples.some((s) => s.controlFlag) ||
          tpDoseGroups.some((g) => g.doseValue === 0);

        const replicateCounts = new Map<string, number>();
        for (const s of tpSamples) {
          replicateCounts.set(
            s.doseGroupId,
            (replicateCounts.get(s.doseGroupId) ?? 0) + 1,
          );
        }
        const tpMinReplicates = Math.min(...replicateCounts.values());

        const splitDesign: ExperimentalDesign = {
          designId: `${d.designId}_tp${tp === undefined ? "none" : tp}`,
          ...(d.studyId ? { studyId: d.studyId } : {}),
          species: d.species,
          doseGroups: tpDoseGroups,
          samples: tpSamples,
          hasControls: tpHasControls,
          minReplicatesPerGroup: tpMinReplicates,
        };

        if (!splitDesign.hasControls && !splitDesign.doseGroups.some((g) => g.doseValue === 0)) {
          errors.push(
            `Split design for timepoint ${tp === undefined ? "undefined" : `${tp}h`} lacks a control group`,
          );
          continue;
        }

        if (tpDoseGroups.length < 2) {
          warnings.push(
            `Split design for timepoint ${tp === undefined ? "undefined" : `${tp}h`} has fewer than 2 dose groups; dose-response modelling may be impossible`,
          );
        }

        splitDesigns = splitDesigns ?? [];
        splitDesigns.push(splitDesign);
      }

      if (splitDesigns && splitDesigns.length > 0) {
        warnings.push(
          `Multi-timepoint design split into ${splitDesigns.length} single-timepoint design(s) per v0.1 policy`,
        );
      }
    }
  } else {
    // Single timepoint: run control check on the original design
    identifiedControlGroupId = checkControlGroup(d, options.controlGroupId, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    orderedDoseGroups,
    ...(identifiedControlGroupId
      ? { identifiedControlGroupId }
      : {}),
    ...(splitDesigns ? { splitDesigns } : {}),
  };
}
