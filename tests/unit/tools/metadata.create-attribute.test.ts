import { registerMetadataTools } from "../../../src/tools/metadata/index.js";

function getCreateAttributeHandler() {
  const tool = registerMetadataTools().find((entry) => entry.name === "create_attribute");
  if (!tool) {
    throw new Error("create_attribute tool not found");
  }

  return tool.handler;
}

describe("create_attribute tool", () => {
  it("returns validated-only when dryRun is true", async () => {
    const handler = getCreateAttributeHandler();

    const connection = {
      get: jest.fn().mockRejectedValue({ response: { status: 404 } }),
      post: jest.fn(),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "new_priority",
        displayName: "Priority",
        attributeType: "String",
        maxLength: 100,
        dryRun: true,
      },
      connection,
    );

    expect(result.success).toBe(true);
    expect(result.operation).toBe("validated-only");
    expect(connection.post).not.toHaveBeenCalled();
  });

  it("creates string attribute when validation passes", async () => {
    const handler = getCreateAttributeHandler();

    const connection = {
      get: jest.fn().mockRejectedValue({ response: { status: 404 } }),
      post: jest.fn().mockResolvedValue({}),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "new_description",
        displayName: "Description",
        attributeType: "String",
        maxLength: 250,
      },
      connection,
    );

    expect(result.success).toBe(true);
    expect(result.operation).toBe("created");
    expect(connection.post).toHaveBeenCalledTimes(1);

    const postCall = connection.post.mock.calls[0];
    expect(postCall[0]).toContain("/EntityDefinitions(LogicalName='account')/Attributes");
    expect(postCall[1]["@odata.type"]).toBe("Microsoft.Dynamics.CRM.StringAttributeMetadata");
    expect(postCall[1].MaxLength).toBe(250);
  });

  it("returns conflict error when attribute already exists", async () => {
    const handler = getCreateAttributeHandler();

    const connection = {
      get: jest.fn().mockResolvedValue({ LogicalName: "new_existing" }),
      post: jest.fn(),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "new_existing",
        displayName: "Existing",
        attributeType: "String",
        maxLength: 100,
      },
      connection,
    );

    expect(result.error).toBe("ConflictError");
    expect(connection.post).not.toHaveBeenCalled();
  });

  it("returns validation error for unsupported attribute type", async () => {
    const handler = getCreateAttributeHandler();

    const connection = {
      get: jest.fn(),
      post: jest.fn(),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "new_price",
        displayName: "Price",
        attributeType: "Money",
      },
      connection,
    );

    expect(result.error).toBe("ValidationError");
    expect(connection.get).not.toHaveBeenCalled();
    expect(connection.post).not.toHaveBeenCalled();
  });

  it("returns validation error for invalid logical name", async () => {
    const handler = getCreateAttributeHandler();

    const connection = {
      get: jest.fn(),
      post: jest.fn(),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "bad-name",
        displayName: "Bad",
        attributeType: "String",
        maxLength: 100,
      },
      connection,
    );

    expect(result.error).toBe("ValidationError");
    expect(connection.get).not.toHaveBeenCalled();
    expect(connection.post).not.toHaveBeenCalled();
  });

  it("returns validation error when maxLength has invalid type", async () => {
    const handler = getCreateAttributeHandler();

    const connection = {
      get: jest.fn(),
      post: jest.fn(),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "new_field",
        displayName: "Field",
        attributeType: "String",
        maxLength: "100",
      },
      connection,
    );

    expect(result.error).toBe("ValidationError");
    expect(connection.get).not.toHaveBeenCalled();
    expect(connection.post).not.toHaveBeenCalled();
  });
});
