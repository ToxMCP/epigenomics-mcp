import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

describe("MCP stdio server smoke test", () => {
  it("responds to a health initialize + tool call sequence", async () => {
    const serverPath = resolve(process.cwd(), "dist/epimcp/cli.js");
    let serverExe = "node";
    let args = [serverPath, "serve"];
    // Fallback to tsx if dist not built
    try {
      await import("fs").then((fs) => fs.promises.access(serverPath));
    } catch {
      serverExe = "npx";
      args = ["tsx", resolve(process.cwd(), "src/epimcp/cli.ts"), "serve"];
    }

    const child = spawn(serverExe, args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "0.1.0" },
      },
    };

    const initializedNotification = {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    };

    const listRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    };

    const toolRequest = {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "health",
        arguments: {},
      },
    };

    const resourceListRequest = {
      jsonrpc: "2.0",
      id: 4,
      method: "resources/list",
    };

    const resourceReadRequest = {
      jsonrpc: "2.0",
      id: 5,
      method: "resources/read",
      params: {
        uri: "epimcp://docs/tool-reference",
      },
    };

    // Wait briefly for server startup
    await new Promise((r) => setTimeout(r, 500));

    child.stdin.write(JSON.stringify(initRequest) + "\n");
    await new Promise((r) => setTimeout(r, 300));
    child.stdin.write(JSON.stringify(initializedNotification) + "\n");
    await new Promise((r) => setTimeout(r, 100));
    child.stdin.write(JSON.stringify(listRequest) + "\n");
    await new Promise((r) => setTimeout(r, 100));
    child.stdin.write(JSON.stringify(toolRequest) + "\n");
    await new Promise((r) => setTimeout(r, 100));
    child.stdin.write(JSON.stringify(resourceListRequest) + "\n");
    await new Promise((r) => setTimeout(r, 100));
    child.stdin.write(JSON.stringify(resourceReadRequest) + "\n");

    // Wait up to 3 seconds for the final response to arrive
    const toolResponsePromise = new Promise<Record<string, unknown> | undefined>((resolve) => {
      const deadline = Date.now() + 3000;
      const check = () => {
        const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
        const lines = stdout
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        const responses = lines
          .map((l) => {
            try {
              return JSON.parse(l) as Record<string, unknown>;
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        const finalResponse = responses.find(
          (r: { id?: number }) => r.id === 5,
        );

        if (finalResponse) {
          resolve(finalResponse);
          return;
        }

        if (Date.now() < deadline) {
          setTimeout(check, 50);
        } else {
          resolve(undefined);
        }
      };
      check();
    });

    const finalResponse = await toolResponsePromise;

    child.kill("SIGTERM");
    await new Promise<void>((res) => {
      child.on("exit", () => res());
    });

    const stderr = Buffer.concat(stderrChunks).toString("utf-8");

    const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
    const lines = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // We expect at least the initialize response and tool response
    expect(lines.length).toBeGreaterThanOrEqual(1);

    if (finalResponse === undefined && stderr.length > 0) {
      throw new Error(`Server stderr: ${stderr}`);
    }

    expect(finalResponse).toBeDefined();
    expect(finalResponse!.result).toBeDefined();

    const listResponse = lines
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .find((r: { id?: number }) => r.id === 2) as
      | { result?: { tools?: Array<Record<string, unknown>> } }
      | undefined;
    expect(listResponse?.result?.tools).toBeDefined();
    const readTable = listResponse!.result!.tools!.find((t) => t.name === "read_table");
    expect(readTable?.outputSchema).toBeDefined();
    expect(readTable?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });

    const resourceListResponse = lines
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .find((r: { id?: number }) => r.id === 4) as
      | { result?: { resources?: Array<Record<string, unknown>> } }
      | undefined;
    expect(resourceListResponse?.result?.resources).toBeDefined();
    const toolReference = resourceListResponse!.result!.resources!.find(
      (r) => r.uri === "epimcp://docs/tool-reference",
    );
    expect(toolReference?.mimeType).toBe("text/markdown");

    const resourceReadResponse = lines
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .find((r: { id?: number }) => r.id === 5) as
      | { result?: { contents?: Array<{ text?: string }> } }
      | undefined;
    expect(resourceReadResponse?.result?.contents?.[0]?.text).toContain(
      "MCP payload envelope",
    );
  }, 10000);
});
