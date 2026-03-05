import { z } from "zod";

import { D365Error } from "./error-handler.js";

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "input";
    return `${path}: ${issue.message}`;
  });
}

export function parseToolArgs<T>(schema: z.ZodType<T>, rawArgs: unknown, toolName: string): T {
  const parseResult = schema.safeParse(rawArgs ?? {});
  if (!parseResult.success) {
    throw new D365Error(
      `Invalid request arguments for ${toolName}`,
      "ValidationError",
      "Review tool input values, types, and required fields.",
      formatZodIssues(parseResult.error),
    );
  }

  return parseResult.data;
}

export function parseToolResponse<T>(
  schema: z.ZodType<T>,
  rawResponse: unknown,
  toolName: string,
): T {
  const parseResult = schema.safeParse(rawResponse);
  if (!parseResult.success) {
    throw new D365Error(
      `Invalid response payload for ${toolName}`,
      "ResponseValidationError",
      "The tool produced an unexpected response shape. Check tool mapping logic and backend payload assumptions.",
      formatZodIssues(parseResult.error),
    );
  }

  return parseResult.data;
}
