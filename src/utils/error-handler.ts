/**
 * Error handler utility for standardized error responses
 */

import { ErrorResponse } from "../types/index.js";

export class D365Error extends Error {
  constructor(
    message: string,
    public errorCode: string,
    public suggestion?: string,
    public details?: any,
  ) {
    super(message);
    this.name = "D365Error";
  }

  toErrorResponse(): ErrorResponse {
    return {
      error: this.errorCode,
      message: this.message,
      suggestion: this.suggestion,
      details: this.details,
    };
  }
}

/**
 * Handle and format errors
 */
export function handleError(error: any): ErrorResponse {
  if (error instanceof D365Error) {
    return error.toErrorResponse();
  }

  const message = String(error?.message || "");
  const lowerMessage = message.toLowerCase();
  const status = error?.response?.status as number | undefined;
  const responseData = error?.response?.data;
  const responseText =
    typeof responseData === "string"
      ? responseData
      : responseData
        ? JSON.stringify(responseData)
        : "";
  const lowerResponseText = responseText.toLowerCase();

  // Handle authentication errors
  if (
    status === 401 ||
    lowerMessage.includes("authentication") ||
    lowerMessage.includes("token") ||
    lowerMessage.includes("invalid_client") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("aadsts") ||
    lowerResponseText.includes("aadsts")
  ) {
    return {
      error: "AuthenticationError",
      message: "Failed to authenticate with Dynamics 365",
      suggestion:
        "Check your D365_CLIENT_ID, D365_CLIENT_SECRET, and D365_TENANT_ID environment variables",
      details: message,
    };
  }

  // Handle network errors
  if (
    error?.code === "ENOTFOUND" ||
    error?.code === "ECONNREFUSED" ||
    error?.code === "ECONNABORTED" ||
    error?.code === "ETIMEDOUT"
  ) {
    return {
      error: "ConnectionError",
      message: "Cannot connect to Dynamics 365",
      suggestion: "Check your D365_URL and network connectivity",
      details: message,
    };
  }

  // Handle not found errors
  if (
    status === 404 ||
    lowerMessage.includes("not found") ||
    lowerMessage.includes("does not exist") ||
    lowerResponseText.includes("not found")
  ) {
    return {
      error: "NotFoundError",
      message,
      suggestion: "Verify the entity, attribute, or component name",
    };
  }

  // Handle permission errors
  if (
    status === 403 ||
    lowerMessage.includes("privilege") ||
    lowerMessage.includes("permission") ||
    lowerMessage.includes("access denied") ||
    lowerResponseText.includes("insufficient privileges")
  ) {
    return {
      error: "PermissionError",
      message: "Insufficient privileges to perform this operation",
      suggestion: "Check your user security roles and permissions",
      details: message,
    };
  }

  // Handle validation errors
  if (
    status === 400 ||
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("required") ||
    lowerResponseText.includes("invalid")
  ) {
    return {
      error: "ValidationError",
      message: message || "The request contains invalid parameters",
      suggestion: "Review tool input values and required fields",
      details: responseText || message,
    };
  }

  // Generic error
  return {
    error: "UnknownError",
    message: message || "An unexpected error occurred",
    suggestion: "Check the logs for more details",
    details: responseText || message,
  };
}
