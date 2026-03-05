/**
 * OData helper utilities for safe query construction.
 */

import { D365Error } from "./error-handler.js";

const LOGICAL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Escapes a string for use inside a single-quoted OData string literal.
 */
export function escapeODataStringLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Validates Dynamics logical names (entity/attribute names).
 */
export function validateLogicalName(value: string, fieldName: string): void {
  if (!LOGICAL_NAME_PATTERN.test(value)) {
    throw new D365Error(
      `Invalid ${fieldName}: '${value}'`,
      "ValidationError",
      `${fieldName} must start with a letter and contain only letters, numbers, or underscores.`,
    );
  }
}

/**
 * Basic validation for SDK message names.
 */
export function validateSdkMessageName(value: string): void {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128 || /[\r\n]/.test(trimmed)) {
    throw new D365Error(
      `Invalid messageName: '${value}'`,
      "ValidationError",
      "messageName must be non-empty, single-line, and under 128 characters.",
    );
  }
}
