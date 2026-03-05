import { registerMetadataTools } from "../../../src/tools/metadata/index.js";

function getUpdateAttributeHandler() {
  const tool = registerMetadataTools().find((entry) => entry.name === "update_attribute");
  if (!tool) {
    throw new Error("update_attribute tool not found");
  }

  return tool.handler;
}

describe("update_attribute tool", () => {
  it("returns validated-only on dryRun", async () => {
    const handler = getUpdateAttributeHandler();

    const connection = {
      get: jest.fn().mockResolvedValue({
        IsCustomAttribute: true,
        AttributeType: "String",
        DisplayName: { UserLocalizedLabel: { Label: "Old Name" } },
        Description: { UserLocalizedLabel: { Label: "Old desc" } },
        RequiredLevel: { Value: "None" },
        MaxLength: 100,
      }),
      patch: jest.fn(),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "new_name",
        displayName: "New Name",
        maxLength: 200,
        dryRun: true,
      },
      connection,
    );

    expect(result.success).toBe(true);
    expect(result.operation).toBe("validated-only");
    expect(result.changedFields).toEqual(expect.arrayContaining(["displayName", "maxLength"]));
    expect(connection.patch).not.toHaveBeenCalled();
  });

  it("returns no-op when no effective changes are requested", async () => {
    const handler = getUpdateAttributeHandler();

    const connection = {
      get: jest.fn().mockResolvedValue({
        IsCustomAttribute: true,
        AttributeType: "String",
        DisplayName: { UserLocalizedLabel: { Label: "Same" } },
        Description: { UserLocalizedLabel: { Label: "Same desc" } },
        RequiredLevel: { Value: "None" },
        MaxLength: 100,
      }),
      patch: jest.fn(),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "new_name",
        displayName: "Same",
        description: "Same desc",
        requiredLevel: "None",
        maxLength: 100,
      },
      connection,
    );

    expect(result.success).toBe(true);
    expect(result.operation).toBe("no-op");
    expect(connection.patch).not.toHaveBeenCalled();
  });

  it("updates mutable fields when valid changes are provided", async () => {
    const handler = getUpdateAttributeHandler();

    const connection = {
      get: jest.fn().mockResolvedValue({
        IsCustomAttribute: true,
        AttributeType: "String",
        DisplayName: { UserLocalizedLabel: { Label: "Old Name" } },
        Description: { UserLocalizedLabel: { Label: "Old desc" } },
        RequiredLevel: { Value: "None" },
        MaxLength: 100,
      }),
      patch: jest.fn().mockResolvedValue({}),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "new_name",
        displayName: "New Name",
        description: "New desc",
        requiredLevel: "ApplicationRequired",
        maxLength: 250,
      },
      connection,
    );

    expect(result.success).toBe(true);
    expect(result.operation).toBe("updated");
    expect(result.changedFields).toEqual(
      expect.arrayContaining(["displayName", "description", "requiredLevel", "maxLength"]),
    );
    expect(connection.patch).toHaveBeenCalledTimes(1);
  });

  it("rejects updates for non-custom attributes", async () => {
    const handler = getUpdateAttributeHandler();

    const connection = {
      get: jest.fn().mockResolvedValue({
        IsCustomAttribute: false,
        AttributeType: "String",
      }),
      patch: jest.fn(),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "name",
        displayName: "Name",
      },
      connection,
    );

    expect(result.error).toBe("ValidationError");
    expect(connection.patch).not.toHaveBeenCalled();
  });

  it("returns validation error when maxLength is used with non-string attributes", async () => {
    const handler = getUpdateAttributeHandler();

    const connection = {
      get: jest.fn().mockResolvedValue({
        IsCustomAttribute: true,
        AttributeType: "Picklist",
        RequiredLevel: { Value: "None" },
      }),
      patch: jest.fn(),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "new_priority",
        maxLength: 20,
      },
      connection,
    );

    expect(result.error).toBe("ValidationError");
    expect(connection.patch).not.toHaveBeenCalled();
  });

  it("returns not found when attribute cannot be loaded", async () => {
    const handler = getUpdateAttributeHandler();

    const connection = {
      get: jest.fn().mockRejectedValue({ response: { status: 404 } }),
      patch: jest.fn(),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "new_missing",
        displayName: "Missing",
      },
      connection,
    );

    expect(result.error).toBe("NotFoundError");
    expect(connection.patch).not.toHaveBeenCalled();
  });

  it("returns validation error for unexpected request fields", async () => {
    const handler = getUpdateAttributeHandler();

    const connection = {
      get: jest.fn(),
      patch: jest.fn(),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        attributeLogicalName: "new_name",
        unknownField: true,
      },
      connection,
    );

    expect(result.error).toBe("ValidationError");
    expect(connection.get).not.toHaveBeenCalled();
    expect(connection.patch).not.toHaveBeenCalled();
  });
});
