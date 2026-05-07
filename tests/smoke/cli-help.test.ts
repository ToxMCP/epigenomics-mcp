import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

describe("CLI help smoke test", () => {
  it("epimcp --help exits 0 and prints usage", () => {
    const cliPath = resolve(process.cwd(), "src/epimcp/cli.ts");
    // Use tsx or ts-node if available; otherwise rely on built output
    let output = "";
    let exitCode = 0;
    try {
      output = execSync("node dist/epimcp/cli.js --help", {
        encoding: "utf-8",
        cwd: process.cwd(),
      });
    } catch (e) {
      exitCode = 1;
      if (e instanceof Error && "stdout" in e && typeof e.stdout === "string") {
        output = e.stdout;
      }
    }
    // If dist doesn't exist yet, skip gracefully
    if (exitCode !== 0) {
      output = execSync("npx tsx src/epimcp/cli.ts --help", {
        encoding: "utf-8",
        cwd: process.cwd(),
        stdio: "pipe",
      });
    }
    expect(output).toContain("epimcp");
    expect(output).toContain("USAGE");
    expect(output).toContain("COMMANDS");
  });
});
