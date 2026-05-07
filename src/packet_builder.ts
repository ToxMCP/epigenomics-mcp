import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  EpigenomicsFeatureResponsePacketSchema,
  type EpigenomicsFeatureResponsePacket,
} from "./contracts/packets.js";
import {
  DoseAxisSchema,
  type DoseAxis,
  type ExperimentalDesign,
} from "./contracts/design.js";
import {
  type DatasetProvenance,
} from "./contracts/provenance.js";
import { type EpigenomicFeature } from "./contracts/features.js";
import {
  type ChemicalExposureContext,
  type BiologicalContext,
} from "./contracts/context.js";
import { type MappingPayloads } from "./contracts/mapping.js";
import type { QualificationWarning } from "./contracts/qualification.js";
import { qualifyFeatures } from "./qualification/engine.js";

export interface BuildPacketOptions {
  /** Override generated packetId. */
  packetId?: string;
  /** Override generated timestamp. */
  generatedAt?: string;
  /** Optional chemical exposure context. */
  chemicalExposureContext?: ChemicalExposureContext;
  /** Optional biological context. */
  biologicalContext?: BiologicalContext;
  /** Optional mapping payloads. */
  mappingPayloads?: MappingPayloads;
  /** Optional annotation traces. */
  annotationTrace?: z.infer<typeof import("./contracts/provenance.js").EpigenomicAnnotationTraceSchema>[];
}

/**
 * Build a deterministic dose axis from an experimental design.
 */
export function buildDoseAxis(design: ExperimentalDesign): DoseAxis {
  const groupMap = new Map<string, { doseGroupId: string; doseValue: number; doseUnit: string; timepointHours?: number; replicateCount: number; sampleIds: string[] }>();

  for (const dg of design.doseGroups) {
    groupMap.set(dg.doseGroupId, {
      doseGroupId: dg.doseGroupId,
      doseValue: dg.doseValue,
      doseUnit: dg.doseUnit,
      timepointHours: dg.timepointHours,
      replicateCount: 0,
      sampleIds: [],
    });
  }

  for (const sample of design.samples) {
    const g = groupMap.get(sample.doseGroupId);
    if (g) {
      g.replicateCount++;
      g.sampleIds.push(sample.sampleId);
    }
  }

  const orderedGroups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.doseValue !== b.doseValue) return a.doseValue - b.doseValue;
    return a.doseGroupId.localeCompare(b.doseGroupId);
  });

  const controlGroup = design.doseGroups.find(
    (g) => g.doseValue === 0,
  );

  return DoseAxisSchema.parse({
    orderedGroups,
    ...(controlGroup ? { controlGroupId: controlGroup.doseGroupId } : {}),
    unit: orderedGroups[0]?.doseUnit,
  });
}

/**
 * Build an EpigenomicsFeatureResponsePacket from validated components.
 *
 * Runs qualification on the supplied features to populate
 * qualificationSummary.  Fail-closed: if no features qualify,
 * the packet is still built but carries a warning.
 */
export function buildFeatureResponsePacket(
  datasetMetadataRef: string,
  designRef: string,
  features: EpigenomicFeature[],
  design: ExperimentalDesign,
  provenance: DatasetProvenance,
  qcReportRef: string,
  options: BuildPacketOptions = {},
): EpigenomicsFeatureResponsePacket {
  const packetId = options.packetId ?? randomUUID();
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  // Run qualification to compute summary
  const tempPacket = {
    schemaVersion: "0.1.0" as const,
    schemaName: "EpigenomicsFeatureResponsePacket" as const,
    packetId,
    datasetMetadataRef,
    designRef,
    features,
    design,
    provenance,
    qualificationSummary: {
      acceptedCount: 0,
      excludedCount: 0,
      exploratoryCount: 0,
      caveatCount: 0,
    },
    qcReportRef,
    warnings: [] as QualificationWarning[],
    generatedAt,
    ...(options.chemicalExposureContext
      ? { chemicalExposureContext: options.chemicalExposureContext }
      : {}),
    ...(options.biologicalContext
      ? { biologicalContext: options.biologicalContext }
      : {}),
    doseAxis: buildDoseAxis(design),
    ...(options.mappingPayloads
      ? { mappingPayloads: options.mappingPayloads }
      : {}),
    ...(options.annotationTrace
      ? { annotationTrace: options.annotationTrace }
      : {}),
  };

  const qualification = qualifyFeatures(tempPacket);

  const acceptedCount = qualification.qualifiedCount;
  const excludedCount = qualification.excludedCount;
  const exploratoryCount = qualification.qualifications
    ? qualification.qualifications.filter((q) => q.status === "exploratory_only").length
    : 0;
  const caveatCount = qualification.qualifications
    ? qualification.qualifications.filter((q) => q.status === "accepted_with_caveats").length
    : 0;

  const packet: EpigenomicsFeatureResponsePacket =
    EpigenomicsFeatureResponsePacketSchema.parse({
      schemaVersion: "0.1.0",
      schemaName: "EpigenomicsFeatureResponsePacket",
      packetId,
      datasetMetadataRef,
      designRef,
      features,
      design,
      provenance,
      qualificationSummary: {
        acceptedCount,
        excludedCount,
        exploratoryCount,
        caveatCount,
      },
      qcReportRef,
      warnings: qualification.warnings,
      generatedAt,
      ...(options.chemicalExposureContext
        ? { chemicalExposureContext: options.chemicalExposureContext }
        : {}),
      ...(options.biologicalContext
        ? { biologicalContext: options.biologicalContext }
        : {}),
      doseAxis: buildDoseAxis(design),
      ...(options.mappingPayloads
        ? { mappingPayloads: options.mappingPayloads }
        : {}),
      ...(options.annotationTrace
        ? { annotationTrace: options.annotationTrace }
        : {}),
    });

  return packet;
}
