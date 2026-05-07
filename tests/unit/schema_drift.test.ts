import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSchemaDrift } from "../../src/scripts/schema-drift.js";

describe("checkSchemaDrift", () => {
  function makeTempDir(): string {
    return mkdtempSync(join(tmpdir(), "schema-drift-test-"));
  }

  it("returns no drift when directories match exactly", () => {
    const committed = makeTempDir();
    const exported = makeTempDir();

    try {
      writeFileSync(
        join(committed, "test.json"),
        JSON.stringify({ type: "object" }) + "\n",
        "utf-8",
      );
      writeFileSync(
        join(exported, "test.json"),
        JSON.stringify({ type: "object" }) + "\n",
        "utf-8",
      );

      const result = checkSchemaDrift(committed, exported);
      expect(result.drift).toBe(false);
      expect(result.files).toHaveLength(0);
    } finally {
      rmSync(committed, { recursive: true, force: true });
      rmSync(exported, { recursive: true, force: true });
    }
  });

  it("detects drift when a file content differs", () => {
    const committed = makeTempDir();
    const exported = makeTempDir();

    try {
      writeFileSync(
        join(committed, "test.json"),
        JSON.stringify({ type: "object", version: 1 }) + "\n",
        "utf-8",
      );
      writeFileSync(
        join(exported, "test.json"),
        JSON.stringify({ type: "object", version: 2 }) + "\n",
        "utf-8",
      );

      const result = checkSchemaDrift(committed, exported);
      expect(result.drift).toBe(true);
      expect(result.files).toContain("test.json");
      expect(result.diff).toContain("Differs: test.json");
    } finally {
      rmSync(committed, { recursive: true, force: true });
      rmSync(exported, { recursive: true, force: true });
    }
  });

  it("detects drift when a file is only in committed", () => {
    const committed = makeTempDir();
    const exported = makeTempDir();

    try {
      writeFileSync(
        join(committed, "old.json"),
        JSON.stringify({ type: "object" }) + "\n",
        "utf-8",
      );

      const result = checkSchemaDrift(committed, exported);
      expect(result.drift).toBe(true);
      expect(result.files).toContain("old.json");
      expect(result.diff).toContain("Only in committed: old.json");
    } finally {
      rmSync(committed, { recursive: true, force: true });
      rmSync(exported, { recursive: true, force: true });
    }
  });

  it("detects drift when a file is only in exported", () => {
    const committed = makeTempDir();
    const exported = makeTempDir();

    try {
      writeFileSync(
        join(exported, "new.json"),
        JSON.stringify({ type: "object" }) + "\n",
        "utf-8",
      );

      const result = checkSchemaDrift(committed, exported);
      expect(result.drift).toBe(true);
      expect(result.files).toContain("new.json");
      expect(result.diff).toContain("Only in exported: new.json");
    } finally {
      rmSync(committed, { recursive: true, force: true });
      rmSync(exported, { recursive: true, force: true });
    }
  });
});
