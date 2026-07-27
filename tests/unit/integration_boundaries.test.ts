import { describe, expect, it } from "vitest";
import { submitHandoff } from "../../src/integrations/bioactivity_pod_client.js";
import { registerEvidence } from "../../src/integrations/evidence_registry_client.js";

describe("unimplemented integration boundaries", () => {
  it("does not fabricate a Bioactivity-PoD delivery receipt", async () => {
    await expect(submitHandoff("handoff-1")).rejects.toThrow(
      /not implemented/,
    );
  });

  it("does not fabricate an Evidence Registry record", async () => {
    await expect(registerEvidence("packet-1")).rejects.toThrow(
      /no evidence record was created/,
    );
  });
});
