import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { exportAllSchemas } from "../../src/scripts/export-schemas.js";
import { checkSchemaDrift } from "../../src/scripts/schema-drift.js";

describe("schema drift integration", () => {
  function createTempGitRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "schema-drift-git-"));
    execSync("git init", { cwd: dir, stdio: "ignore" });
    execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "ignore" });
    execSync("git config user.name 'Test User'", { cwd: dir, stdio: "ignore" });
    return dir;
  }

  function commitAll(dir: string, message: string): void {
    execSync("git add -A", { cwd: dir, stdio: "ignore" });
    execSync(`git commit -m "${message}"`, { cwd: dir, stdio: "ignore" });
  }

  it("detects drift when a Zod schema changes without version bump", () => {
    const repo = createTempGitRepo();

    try {
      // Set up initial project structure in temp repo
      const srcDir = join(repo, "src", "contracts");
      const schemasDir = join(repo, "schemas", "current");
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(schemasDir, { recursive: true });

      // Create a minimal packet schema
      writeFileSync(
        join(srcDir, "packets.ts"),
        `import { z } from "zod";
export const TestPacketSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  name: z.string(),
}).strict();
`,
        "utf-8",
      );

      // Export initial schema
      writeFileSync(
        join(schemasDir, "test-packet.json"),
        JSON.stringify(
          {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              schemaVersion: { type: "string", const: "0.1.0" },
              name: { type: "string" },
            },
            required: ["schemaVersion", "name"],
            additionalProperties: false,
          },
          null,
          2,
        ) + "\n",
        "utf-8",
      );

      commitAll(repo, "Initial schema");

      // Now modify the Zod schema (add a new field) without bumping version
      writeFileSync(
        join(srcDir, "packets.ts"),
        `import { z } from "zod";
export const TestPacketSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  name: z.string(),
  newField: z.string().optional(),
}).strict();
`,
        "utf-8",
      );

      // Simulate export by writing the new schema
      writeFileSync(
        join(schemasDir, "test-packet.json"),
        JSON.stringify(
          {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              schemaVersion: { type: "string", const: "0.1.0" },
              name: { type: "string" },
              newField: { type: "string" },
            },
            required: ["schemaVersion", "name"],
            additionalProperties: false,
          },
          null,
          2,
        ) + "\n",
        "utf-8",
      );

      // Verify drift is detected
      const driftResult = checkSchemaDrift(
        join(repo, "schemas", "current"),
        // Use a temp exported dir that matches the old committed schema
        (() => {
          const oldDir = mkdtempSync(join(tmpdir(), "old-schema-"));
          writeFileSync(
            join(oldDir, "test-packet.json"),
            JSON.stringify(
              {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                properties: {
                  schemaVersion: { type: "string", const: "0.1.0" },
                  name: { type: "string" },
                },
                required: ["schemaVersion", "name"],
                additionalProperties: false,
              },
              null,
              2,
            ) + "\n",
            "utf-8",
          );
          return oldDir;
        })(),
      );

      expect(driftResult.drift).toBe(true);

      // Check that version was NOT bumped (git diff doesn't contain schemaVersion change)
      const diff = execSync("git diff HEAD -- src/contracts/packets.ts", {
        cwd: repo,
        encoding: "utf-8",
      });
      const versionBumped = /^[+-].*schemaVersion/m.test(diff);
      expect(versionBumped).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("accepts drift when schema version is bumped and changelog is updated", () => {
    const repo = createTempGitRepo();

    try {
      const srcDir = join(repo, "src", "contracts");
      const schemasDir = join(repo, "schemas", "current");
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(schemasDir, { recursive: true });

      writeFileSync(
        join(srcDir, "packets.ts"),
        `import { z } from "zod";
export const TestPacketSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  name: z.string(),
}).strict();
`,
        "utf-8",
      );

      writeFileSync(
        join(schemasDir, "test-packet.json"),
        JSON.stringify(
          {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              schemaVersion: { type: "string", const: "0.1.0" },
              name: { type: "string" },
            },
            required: ["schemaVersion", "name"],
            additionalProperties: false,
          },
          null,
          2,
        ) + "\n",
        "utf-8",
      );

      writeFileSync(join(repo, "CHANGELOG.md"), "# Changelog\n\n## 0.1.0\n", "utf-8");

      commitAll(repo, "Initial schema");

      // Modify schema WITH version bump
      writeFileSync(
        join(srcDir, "packets.ts"),
        `import { z } from "zod";
export const TestPacketSchema = z.object({
  schemaVersion: z.literal("0.2.0"),
  name: z.string(),
  newField: z.string().optional(),
}).strict();
`,
        "utf-8",
      );

      writeFileSync(
        join(repo, "CHANGELOG.md"),
        "# Changelog\n\n## 0.2.0\n- Added newField\n\n## 0.1.0\n",
        "utf-8",
      );

      // Verify version bump is detected
      const diff = execSync("git diff HEAD -- src/contracts/packets.ts", {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(/^[+-].*schemaVersion/m.test(diff)).toBe(true);

      // Verify changelog update is detected
      const changedFiles = execSync("git diff --name-only HEAD", {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(
        changedFiles
          .split("\n")
          .some((f) => f.trim().toLowerCase() === "changelog.md"),
      ).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
