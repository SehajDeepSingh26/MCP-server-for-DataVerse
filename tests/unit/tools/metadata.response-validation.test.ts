import { registerMetadataTools } from "../../../src/tools/metadata/index.js";

function getToolHandler(toolName: string) {
  const tool = registerMetadataTools().find((entry) => entry.name === toolName);
  if (!tool) {
    throw new Error(`${toolName} tool not found`);
  }

  return tool.handler;
}

describe("metadata tool response validation", () => {
  it("returns ResponseValidationError when describe_entity maps invalid payload", async () => {
    const handler = getToolHandler("describe_entity");

    const connection = {
      get: jest.fn().mockResolvedValue({
        SchemaName: "Account",
        ObjectTypeCode: 1,
        PrimaryIdAttribute: "accountid",
        PrimaryNameAttribute: "name",
        IsCustomEntity: false,
        OneToManyRelationships: [],
        ManyToOneRelationships: [],
        ManyToManyRelationships: [],
      }),
    };

    const result = await handler(
      {
        entityLogicalName: "account",
        includeAttributes: false,
        includeRelationships: false,
      },
      connection,
    );

    expect(result.error).toBe("ResponseValidationError");
  });

  it("returns ResponseValidationError when list_entities contains invalid item shape", async () => {
    const handler = getToolHandler("list_entities");

    const connection = {
      get: jest.fn().mockResolvedValue({
        value: [
          {
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            IsCustomEntity: false,
            ObjectTypeCode: 1,
          },
        ],
      }),
    };

    const result = await handler({}, connection);

    expect(result.error).toBe("ResponseValidationError");
  });
});
