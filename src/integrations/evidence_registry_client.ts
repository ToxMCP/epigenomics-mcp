/**
 * Evidence Registry MCP client.
 *
 * Responsibilities:
 * - Register evidence packets for audit trail
 * - Retrieve packet lineage
 */

export interface EvidenceRecord {
  recordId: string;
  packetRef: string;
  registeredAt: string;
}

/**
 * Reject registration until the planned Evidence Registry transport exists.
 *
 * Returning a generated identifier here would falsely imply that durable
 * evidence was registered when no network or persistence operation occurred.
 */
export async function registerEvidence(
  _packetRef: string,
  _endpoint?: string,
): Promise<EvidenceRecord> {
  throw new Error(
    "Evidence Registry submission is planned; no evidence record was created.",
  );
}
