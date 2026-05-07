import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("dependency configuration", () => {
  it("package.json contains core TypeScript runtime dependencies", () => {
    const pkgPath = resolve(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBeDefined();
    expect(pkg.dependencies.zod).toBeDefined();
    expect(pkg.dependencies["zod-to-json-schema"]).toBeDefined();
    expect(pkg.dependencies["js-yaml"]).toBeDefined();

    expect(pkg.devDependencies.typescript).toBeDefined();
    expect(pkg.devDependencies.vitest).toBeDefined();
    expect(pkg.devDependencies["@vitest/coverage-v8"]).toBeDefined();
  });

  it("pyproject.toml declares Python 3.11+ and core dependencies", () => {
    const tomlPath = resolve(process.cwd(), "pyproject.toml");
    const toml = readFileSync(tomlPath, "utf-8");

    expect(toml).toContain('requires-python = ">=3.11"');
    expect(toml).toContain('"pydantic>=2.0"');
    expect(toml).toContain('"pandas>=2.0"');
    expect(toml).toContain('"bioframe>=0.7.0"');
    expect(toml).toContain('"duckdb>=1.0"');
    expect(toml).toContain('"scipy>=1.12"');
    expect(toml).toContain('"statsmodels>=0.14"');
    expect(toml).toContain('"httpx>=0.27"');
    expect(toml).toContain('"typer>=0.12"');
    expect(toml).toContain('"mcp>=1.0"');
  });

  it("pyproject.toml defines optional extras for large intervals and adapters", () => {
    const tomlPath = resolve(process.cwd(), "pyproject.toml");
    const toml = readFileSync(tomlPath, "utf-8");

    expect(toml).toContain("[project.optional-dependencies]");
    expect(toml).toContain('large-intervals = [');
    expect(toml).toContain('adapters = [');
  });

  it("pyproject.toml declares dev dependencies", () => {
    const tomlPath = resolve(process.cwd(), "pyproject.toml");
    const toml = readFileSync(tomlPath, "utf-8");

    expect(toml).toContain('"pytest>=7.0"');
    expect(toml).toContain('"pytest-cov>=4.0"');
    expect(toml).toContain('"ruff>=0.1.0"');
    expect(toml).toContain('"mypy>=1.0"');
  });
});
