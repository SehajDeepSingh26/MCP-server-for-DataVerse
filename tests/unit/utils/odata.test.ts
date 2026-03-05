import {
  escapeODataStringLiteral,
  validateLogicalName,
  validateSdkMessageName,
} from "../../../src/utils/odata.js";
import { D365Error } from "../../../src/utils/error-handler.js";

describe("odata utils", () => {
  it("escapes single quotes in OData literals", () => {
    expect(escapeODataStringLiteral("a'b'c")).toBe("a''b''c");
  });

  it("accepts valid logical names", () => {
    expect(() => validateLogicalName("account", "entityLogicalName")).not.toThrow();
    expect(() => validateLogicalName("new_customField_1", "entityLogicalName")).not.toThrow();
  });

  it("rejects invalid logical names", () => {
    expect(() => validateLogicalName("1account", "entityLogicalName")).toThrow(D365Error);
    expect(() => validateLogicalName("bad-name", "entityLogicalName")).toThrow(
      "Invalid entityLogicalName",
    );
  });

  it("accepts valid sdk message names", () => {
    expect(() => validateSdkMessageName("Create")).not.toThrow();
    expect(() => validateSdkMessageName("WinOpportunity")).not.toThrow();
  });

  it("rejects invalid sdk message names", () => {
    expect(() => validateSdkMessageName("")).toThrow(D365Error);
    expect(() => validateSdkMessageName("A\nB")).toThrow("Invalid messageName");
  });
});
