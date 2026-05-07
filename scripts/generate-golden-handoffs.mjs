import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHandoffPacket } from "../dist/handoff/builder.js";

const EXAMPLES = ["accepted", "accepted_with_warnings", "excluded"];

const HANDOFF_OPTIONS = {
  handoffId: "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  generatedAt: "2026-05-05T00:00:00Z",
};

for (const name of EXAMPLES) {
  const packetPath = join(
    process.cwd(),
    "benchmarks",
    "expected",
    "golden_handoff_examples",
    name,
    "packet.json",
  );
  const handoffPath = join(
    process.cwd(),
    "examples",
    "bioactivity_pod_handoff_valid",
    `${name}.json`,
  );

  const packet = JSON.parse(readFileSync(packetPath, "utf-8"));
  const handoff = createHandoffPacket(packet, HANDOFF_OPTIONS);

  if (!handoff) {
    console.error(`Failed to generate handoff for ${name}`);
    process.exit(1);
  }

  writeFileSync(handoffPath, JSON.stringify(handoff, null, 2) + "\n");
  console.log(`Generated ${handoffPath}`);
}

console.log("Done.");
