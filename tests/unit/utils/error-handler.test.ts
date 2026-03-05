import { D365Error, handleError } from "../../../src/utils/error-handler.js";

describe("handleError", () => {
  it("returns structured D365Error response", () => {
    const error = new D365Error("Bad logical name", "ValidationError", "Use underscore only");
    const result = handleError(error);

    expect(result.error).toBe("ValidationError");
    expect(result.message).toBe("Bad logical name");
    expect(result.suggestion).toBe("Use underscore only");
  });

  it("maps AAD/auth errors", () => {
    const result = handleError({ message: "AADSTS7000215: Invalid client secret" });
    expect(result.error).toBe("AuthenticationError");
  });

  it("maps permission errors from status code", () => {
    const result = handleError({ message: "Forbidden", response: { status: 403 } });
    expect(result.error).toBe("PermissionError");
  });

  it("maps not found errors from status code", () => {
    const result = handleError({ message: "Not found", response: { status: 404 } });
    expect(result.error).toBe("NotFoundError");
  });

  it("maps validation errors", () => {
    const result = handleError({ message: "Invalid request", response: { status: 400 } });
    expect(result.error).toBe("ValidationError");
  });
});
