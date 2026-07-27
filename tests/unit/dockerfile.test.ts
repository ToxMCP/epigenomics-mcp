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
    expect(dockerfile).toMatch(/AS runtime/i);
    expect(dockerfile).not.toMatch(/AS python-env/i);
  });

  it("installs production Node.js dependencies only in runtime", () => {
    expect(dockerfile).toMatch(/npm ci --omit=dev/i);
  });

  it("uses the correct entrypoint for epimcp cli", () => {
    expect(dockerfile).toMatch(/ENTRYPOINT\s*\[\s*"node"\s*,\s*"dist\/epimcp\/cli\.js"\s*\]/i);
  });

  it("defaults to stdio serve command", () => {
    expect(dockerfile).toMatch(/CMD\s*\[\s*"serve"\s*\]/i);
  });

  it("verifies the Node.js installation without carrying a second runtime", () => {
    expect(dockerfile).toMatch(/import\(['"]\.\/dist\/epimcp\/index\.js['"]\)/);
    expect(dockerfile).not.toMatch(/pip install/i);
    expect(dockerfile).not.toMatch(/python:/i);
  });

  it("runs as the unprivileged node user and includes audit resources", () => {
    expect(dockerfile).toMatch(/^USER node$/im);
    expect(dockerfile).toMatch(/COPY schemas\//i);
    expect(dockerfile).toMatch(/COPY release-evidence\//i);
    expect(dockerfile).toMatch(/COPY benchmark_manifest\.yaml/i);
  });
});
