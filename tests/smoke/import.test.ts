import { describe, it, expect } from "vitest";

describe("import smoke tests", () => {
  it("can import the main index module", async () => {
    const mod = await import("../../src/epimcp/index.js");
    expect(mod.VERSION).toBe("0.1.0");
    expect(typeof mod.loadConfig).toBe("function");
    expect(typeof mod.startServer).toBe("function");
    expect(typeof mod.loadManifest).toBe("function");
  });

  it("can import contract modules", async () => {
    const coordinates = await import("../../src/contracts/coordinates.js");
    expect(typeof coordinates.GenomeBuildSchema).toBe("object");

    const features = await import("../../src/contracts/features.js");
    expect(typeof features.EpigenomicFeatureSchema).toBe("object");

    const packets = await import("../../src/contracts/packets.js");
    expect(typeof packets.EpigenomicsFeatureResponsePacketSchema).toBe("object");
  });

  it("can import validator modules", async () => {
    const design = await import("../../src/validators/design.js");
    expect(typeof design.validateDesign).toBe("function");

    const coordinates = await import("../../src/validators/coordinates.js");
    expect(typeof coordinates.validateCoordinates).toBe("function");
  });

  it("can import qualification engine", async () => {
    const engine = await import("../../src/qualification/engine.js");
    expect(typeof engine.qualifyFeatures).toBe("function");
  });

  it("can import handoff builder", async () => {
    const builder = await import("../../src/handoff/builder.js");
    expect(typeof builder.buildHandoffPacket).toBe("function");
  });
});
