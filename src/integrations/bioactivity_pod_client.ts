/**
 * Bioactivity-PoD MCP client.
 *
 * Responsibilities:
 * - Create BioactivityPoDHandoffPacket from qualified EpigenomicsFeatureResponsePackets
 * - Never call Bioactivity-PoD models directly in v0.1
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
 * This is the primary v0.1 handoff entry point.  It runs the deterministic
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
 * Placeholder client for Bioactivity-PoD MCP.
 *
 * v0.1 does not invoke downstream Bioactivity-PoD models directly.
 * The handoff packet is returned to the caller for explicit submission.
 */
export async function submitHandoff(
  _handoffId: string,
  _endpoint?: string,
): Promise<HandoffSubmission> {
  return {
    handoffId: _handoffId,
    packetRef: "placeholder",
    submittedAt: new Date().toISOString(),
  };
}
