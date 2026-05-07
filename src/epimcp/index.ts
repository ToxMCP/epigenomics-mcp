/**
 * Epigenomics MCP – Model Context Protocol server for processed epigenomic feature evidence qualification.
 *
 * @packageDocumentation
 */

export { VERSION } from "./version.js";
export type {
  Config,
  CoordinateDefaults,
  MissingnessThresholds,
  ReplicateThresholds,
  LocalSnapshotPaths,
  FileAccessPolicy,
} from "./config.js";
export {
  loadConfig,
  loadConfigFromEnv,
  loadConfigFromFile,
  ConfigSchema,
  CoordinateDefaultsSchema,
  MissingnessThresholdsSchema,
  ReplicateThresholdsSchema,
  LocalSnapshotPathsSchema,
  FileAccessPolicySchema,
} from "./config.js";
export { startServer } from "./server.js";
export {
  registerAuditResources,
  getRegisteredAuditResourceUris,
} from "./resources.js";
export {
  ReleaseEvidenceSchema,
  ReleaseEvidenceChecksumSchema,
} from "../release_evidence/schema.js";
export {
  RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES,
  RELEASE_EVIDENCE_CHECKSUM_FILES,
  RELEASE_EVIDENCE_GENERATED_FILES,
  formatChecksumFile,
} from "../release_evidence/artifacts.js";
export type {
  ReleaseEvidence,
  ReleaseEvidenceChecksum,
} from "../release_evidence/schema.js";
export {
  loadManifest,
  validateManifest,
  hasNonGoal,
  hasDocsPath,
  getIntegrationByName,
  getReleaseGateByName,
  ToxMcpManifestSchema,
} from "./manifest.js";
export type {
  ToxMcpManifest,
  ManifestIntegration,
  ManifestReleaseGate,
} from "./manifest.js";
