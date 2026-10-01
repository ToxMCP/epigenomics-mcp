import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";

/** Preserve released Zod 3 validation and Draft 7 catalogs at the SDK boundary. */
export function toMcpSchema<T extends z.ZodTypeAny>(
  schema: T,
): StandardSchemaWithJSON<z.input<T>, z.output<T>> {
  return {
    "~standard": {
      version: 1,
      vendor: "epigenomics-zod3",
      validate: async (value: unknown) => {
        const result = await schema.safeParseAsync(value);
        if (result.success) {
          return { value: result.data };
        }
        return {
          issues: result.error.issues.map(({ message, path }) => ({ message, path })),
        };
      },
      jsonSchema: {
        input: () => zodToJsonSchema(schema, { strictUnions: true, pipeStrategy: "input" }),
        output: () => zodToJsonSchema(schema, { strictUnions: true, pipeStrategy: "output" }),
      },
    },
  };
}
