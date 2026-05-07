import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dockerfilePath = resolve(process.cwd(), "Dockerfile");

describe("Dockerfile validation", () => {
  let dockerfile: string;

  try {
    dockerfile = readFileSync(dockerfilePath, "utf-8");
  } catch {
    dockerfile = "";
  }

  it("exists", () => {
    expect(dockerfile.length).toBeGreaterThan(0);
  });

  it("does not expose network transport by default", () => {
    const lines = dockerfile.split("\n").map((l) => l.trim().toLowerCase());
    const exposeLines = lines.filter((l) => l.startsWith("expose "));
    expect(exposeLines).toEqual([]);
  });

  it("has a multi-stage build", () => {
    expect(dockerfile).toMatch(/AS ts-build/i);
    expect(dockerfile).toMatch(/AS python-env/i);
    expect(dockerfile).toMatch(/AS runtime/i);
  });

  it("uses the correct entrypoint for epimcp cli", () => {
    expect(dockerfile).toMatch(/ENTRYPOINT\s*\[\s*"node"\s*,\s*"dist\/epimcp\/cli\.js"\s*\]/i);
  });

  it("defaults to stdio serve command", () => {
    expect(dockerfile).toMatch(/CMD\s*\[\s*"serve"\s*\]/i);
  });

  it("verifies both Node.js and Python installations", () => {
    expect(dockerfile).toMatch(/import\(['"]\.\/dist\/epimcp\/index\.js['"]\)/);
    expect(dockerfile).toMatch(/import epigenomics_mcp/);
    expect(dockerfile).toMatch(/__version__/);
  });
});
