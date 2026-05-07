import { randomUUID } from "node:crypto";
import {
  BioactivityPoDHandoffPacketSchema,
  type BioactivityPoDHandoffPacket,
} from "../contracts/packets.js";
import { EpigenomicsFeatureResponsePacketSchema } from "../contracts/packets.js";
import { qualifyFeatures } from "../qualification/engine.js";
import { guardClaims } from "../qualification/claim_guards.js";

export interface HandoffBuildResult {
  handoffId: string;
  qualifiedFeatureCount: number;
  readyForPod: boolean;
}

export interface HandoffBuildOptions {
  /** Override the generated handoffId (default: randomUUID()). */
  handoffId?: string;
  /** Override the generatedAt timestamp (default: new Date().toISOString()). */
  generatedAt?: string;
}

/**
 * Create a BioactivityPoDHandoffPacket from a validated EpigenomicsFeatureResponsePacket.
 *
 * Uses the qualification engine to determine per-feature eligibility.
 * Includes both accepted_for_pod and accepted_with_caveats features in the
 * doseResponseReadySubset.
 *
 * Returns null if the packet fails schema validation.
 */
export function createHandoffPacket(
  packet: unknown,
  options: HandoffBuildOptions = {},
): BioactivityPoDHandoffPacket | null {
  const parseResult = EpigenomicsFeatureResponsePacketSchema.safeParse(packet);
  if (!parseResult.success) {
    return null;
  }

  const validated = parseResult.data;
  const handoffId = options.handoffId ?? randomUUID();
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  // Run deterministic qualification engine
  const qualification = qualifyFeatures(validated);

  const qualifications = qualification.qualifications ?? [];

  const qualifiedFeatures = qualifications.filter(
    (q) =>
      q.status === "accepted_for_pod" || q.status === "accepted_with_caveats",
  );

  const excludedFeatures = qualifications.filter(
    (q) =>
      q.status !== "accepted_for_pod" && q.status !== "accepted_with_caveats",
  );

  // Default handoff subset: all accepted and accepted-with-caveats features
  const doseResponseReadySubset = qualifiedFeatures.map((q) => q.featureId);

  // Fail-closed: if no features are dose-response-ready, do not emit a handoff packet
  if (doseResponseReadySubset.length === 0) {
    return null;
  }

  // Apply claim guards and strip unsupported claims from handoff
  const claimGuardResult = guardClaims(validated.design);

  // Collect mandatory caveats from packet warnings and qualification warnings
  const packetBlockingWarnings = validated.warnings.filter(
    (w) => w.blocksDownstream,
  );
  const qualificationBlockingWarnings = qualifications
    .flatMap((q) => q.warnings)
    .filter((w) => w.blocksDownstream);

  // Deduplicate warnings by warningCode to avoid repetition
  const caveatMap = new Map<string, typeof packetBlockingWarnings[number]>();
  for (const w of [...packetBlockingWarnings, ...qualificationBlockingWarnings]) {
    if (!caveatMap.has(w.warningCode)) {
      caveatMap.set(w.warningCode, w);
    }
  }
  const mandatoryCaveats = Array.from(caveatMap.values());

  const handoff: BioactivityPoDHandoffPacket =
    BioactivityPoDHandoffPacketSchema.parse({
      schemaVersion: "0.1.0",
      schemaName: "BioactivityPoDHandoffPacket",
      handoffId,
      sourcePacketRef: validated.packetId,
      qualifiedFeatures,
      excludedFeatures,
      doseResponseReadySubset,
      mandatoryCaveats,
      generatedAt,
      persistenceStatus: claimGuardResult.persistenceStatus,
      reversibilityStatus: claimGuardResult.reversibilityStatus,
      heritabilityClaim: claimGuardResult.heritabilityClaim,
      provenance: validated.provenance,
    });

  return handoff;
}

/**
 * Build a Bioactivity-PoD handoff summary from a qualified response packet.
 *
 * Delegates to {@link createHandoffPacket} for deterministic qualification.
 * Returns readyForPod=true when the doseResponseReadySubset is non-empty.
 */
export function buildHandoffPacket(
  packet: unknown,
  options: HandoffBuildOptions = {},
): HandoffBuildResult {
  const handoff = createHandoffPacket(packet, options);
  if (!handoff) {
    return {
      handoffId: options.handoffId ?? randomUUID(),
      qualifiedFeatureCount: 0,
      readyForPod: false,
    };
  }

  return {
    handoffId: handoff.handoffId,
    qualifiedFeatureCount: handoff.doseResponseReadySubset.length,
    readyForPod: handoff.doseResponseReadySubset.length > 0,
  };
}
