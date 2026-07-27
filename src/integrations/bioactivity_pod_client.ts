/**
 * Bioactivity-PoD MCP client.
 *
 * Responsibilities:
 * - Create BioactivityPoDHandoffPacket from qualified EpigenomicsFeatureResponsePackets
 * - Never call Bioactivity-PoD models directly in v0.2
 */

import {
  createHandoffPacket,
  type HandoffBuildOptions,
} from "../handoff/builder.js";
import type { BioactivityPoDHandoffPacket } from "../contracts/packets.js";

export interface HandoffSubmission {
  handoffId: string;
  packetRef: string;
  submittedAt: string;
}

/**
 * Export a BioactivityPoDHandoffPacket from a validated feature-response packet.
 *
 * This is the primary v0.2 handoff entry point. It runs the deterministic
 * qualification engine, partitions features into qualified/excluded sets, and
 * constructs the dose-response-ready subset containing both
 * accepted_for_pod and accepted_with_caveats features.
 *
 * Fail-closed: returns null when the source packet is schema-invalid.
 */
export function exportHandoffPacket(
  packet: unknown,
  options?: HandoffBuildOptions,
): BioactivityPoDHandoffPacket | null {
  return createHandoffPacket(packet, options);
}

/**
 * Reject direct Bioactivity-PoD submission until a real transport is configured.
 *
 * Returning a fabricated packet reference would falsely imply delivery. Callers
 * must export the schema-validated handoff and submit it through an orchestrator.
 */
export async function submitHandoff(
  _handoffId: string,
  _endpoint?: string,
): Promise<HandoffSubmission> {
  throw new Error(
    "Direct Bioactivity-PoD submission is not implemented; use exportHandoffPacket and submit the validated packet through an orchestrator.",
  );
}
