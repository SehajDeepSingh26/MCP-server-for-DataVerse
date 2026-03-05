/**
 * Metadata Tools Registration
 *
 * Tools for querying and managing D365 entity metadata
 */

import { AttributeType, ToolDefinition } from "../../types/index.js";
import { D365Connection } from "../../d365/connection.js";
import { D365Error, handleError } from "../../utils/error-handler.js";
import { escapeODataStringLiteral, validateLogicalName } from "../../utils/odata.js";
import { parseToolArgs, parseToolResponse } from "../../utils/zod-validation.js";
import { z } from "zod";

const SUPPORTED_CREATE_ATTRIBUTE_TYPES: ReadonlySet<AttributeType> = new Set([
  "String",
  "Picklist",
]);

interface CreateAttributeOptionInput {
  label: string;
  value: number;
}

interface CreateAttributeArgs {
  entityLogicalName: string;
  attributeLogicalName: string;
  displayName: string;
  attributeType: AttributeType;
  requiredLevel?: "None" | "ApplicationRequired" | "Recommended";
  maxLength?: number;
  options?: CreateAttributeOptionInput[];
  description?: string;
  dryRun?: boolean;
}

interface UpdateAttributeArgs {
  entityLogicalName: string;
  attributeLogicalName: string;
  displayName?: string;
  description?: string;
  requiredLevel?: "None" | "ApplicationRequired" | "Recommended";
  maxLength?: number;
  dryRun?: boolean;
}

const describeEntityArgsSchema = z
  .object({
    entityLogicalName: z.string(),
    includeAttributes: z.boolean().optional().default(true),
    includeRelationships: z.boolean().optional().default(true),
  })
  .strict();

const listEntitiesArgsSchema = z
  .object({
    customOnly: z.boolean().optional().default(false),
    searchTerm: z.string().min(1).optional(),
  })
  .strict();

const getAttributeDetailsArgsSchema = z
  .object({
    entityLogicalName: z.string(),
    attributeLogicalName: z.string(),
  })
  .strict();

const createAttributeOptionInputSchema = z
  .object({
    label: z.string().min(1),
    value: z.number().int(),
  })
  .strict();

const createAttributeArgsSchema = z
  .object({
    entityLogicalName: z.string(),
    attributeLogicalName: z.string(),
    displayName: z.string(),
    attributeType: z.enum(["String", "Picklist"]),
    requiredLevel: z.enum(["None", "ApplicationRequired", "Recommended"]).optional(),
    maxLength: z.number().int().optional(),
    options: z.array(createAttributeOptionInputSchema).optional(),
    description: z.string().optional(),
    dryRun: z.boolean().optional().default(false),
  })
  .strict();

const updateAttributeArgsSchema = z
  .object({
    entityLogicalName: z.string(),
    attributeLogicalName: z.string(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    requiredLevel: z.enum(["None", "ApplicationRequired", "Recommended"]).optional(),
    maxLength: z.number().int().optional(),
    dryRun: z.boolean().optional().default(false),
  })
  .strict();

const describeEntityResponseSchema = z
  .object({
    logicalName: z.string(),
    schemaName: z.string(),
    displayName: z.string().optional(),
    objectTypeCode: z.number(),
    primaryIdAttribute: z.string(),
    primaryNameAttribute: z.string(),
    isCustomEntity: z.boolean(),
    attributes: z
      .array(
        z
          .object({
            logicalName: z.string(),
            schemaName: z.string(),
            displayName: z.string().optional(),
            attributeType: z.string().optional(),
            isPrimaryId: z.boolean().optional(),
            isPrimaryName: z.boolean().optional(),
            isCustomAttribute: z.boolean().optional(),
            requiredLevel: z.string().optional(),
            maxLength: z.number().nullable().optional(),
          })
          .strict(),
      )
      .optional(),
    relationshipCount: z
      .object({
        oneToMany: z.number(),
        manyToOne: z.number(),
        manyToMany: z.number(),
      })
      .strict(),
  })
  .strict();

const listEntitiesResponseSchema = z
  .object({
    totalCount: z.number(),
    entities: z.array(
      z
        .object({
          logicalName: z.string(),
          schemaName: z.string(),
          displayName: z.string().optional(),
          isCustomEntity: z.boolean().optional(),
          objectTypeCode: z.number().optional(),
        })
        .strict(),
    ),
  })
  .strict();

const getAttributeDetailsResponseSchema = z
  .object({
    logicalName: z.string(),
    schemaName: z.string(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    attributeType: z.string().optional(),
    isPrimaryId: z.boolean().optional(),
    isPrimaryName: z.boolean().optional(),
    isCustomAttribute: z.boolean().optional(),
    isValidForCreate: z.boolean().optional(),
    isValidForUpdate: z.boolean().optional(),
    isValidForRead: z.boolean().optional(),
    requiredLevel: z.string().optional(),
    maxLength: z.number().nullable().optional(),
    format: z.string().nullable().optional(),
    options: z
      .array(
        z
          .object({
            value: z.number(),
            label: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

const createAttributeResponseSchema = z
  .object({
    success: z.literal(true),
    operation: z.enum(["validated-only", "created"]),
    entityLogicalName: z.string(),
    attributeLogicalName: z.string(),
    attributeType: z.enum(["String", "Picklist"]),
    warnings: z.array(z.string()),
    payloadPreview: z.record(z.unknown()).optional(),
  })
  .strict();

const updateAttributeResponseSchema = z
  .object({
    success: z.literal(true),
    operation: z.enum(["validated-only", "updated", "no-op"]),
    entityLogicalName: z.string(),
    attributeLogicalName: z.string(),
    changedFields: z.array(z.string()),
    warnings: z.array(z.string()).optional(),
    payloadPreview: z.record(z.unknown()).optional(),
  })
  .strict();

function toLocalizedLabel(label: string): Record<string, unknown> {
  return {
    LocalizedLabels: [
      {
        Label: label,
        LanguageCode: 1033,
      },
    ],
  };
}

function getUserLocalizedLabel(value: any): string | undefined {
  return value?.UserLocalizedLabel?.Label;
}

function validateRequiredLevel(requiredLevel?: string): void {
  if (!requiredLevel) {
    return;
  }

  const allowed = new Set(["None", "ApplicationRequired", "Recommended"]);
  if (!allowed.has(requiredLevel)) {
    throw new D365Error(
      `Invalid requiredLevel: '${requiredLevel}'`,
      "ValidationError",
      "requiredLevel must be one of: None, ApplicationRequired, Recommended.",
    );
  }
}

function buildAttributeCreatePayload(args: CreateAttributeArgs): Record<string, unknown> {
  const {
    attributeType,
    attributeLogicalName,
    displayName,
    description,
    requiredLevel = "None",
    maxLength,
    options,
  } = args;

  const basePayload: Record<string, unknown> = {
    LogicalName: attributeLogicalName,
    SchemaName: attributeLogicalName,
    DisplayName: toLocalizedLabel(displayName),
    RequiredLevel: { Value: requiredLevel },
  };

  if (description?.trim()) {
    basePayload.Description = toLocalizedLabel(description.trim());
  }

  if (attributeType === "String") {
    if (typeof maxLength !== "number" || maxLength < 1 || maxLength > 4000) {
      throw new D365Error(
        "Invalid maxLength for String attribute",
        "ValidationError",
        "For String attributes, maxLength is required and must be between 1 and 4000.",
      );
    }

    return {
      ...basePayload,
      "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
      MaxLength: maxLength,
      FormatName: {
        Value: "Text",
      },
    };
  }

  if (attributeType === "Picklist") {
    if (!options || options.length < 2) {
      throw new D365Error(
        "Invalid options for Picklist attribute",
        "ValidationError",
        "Picklist attributes require at least 2 options.",
      );
    }

    const seenValues = new Set<number>();
    for (const option of options) {
      if (seenValues.has(option.value)) {
        throw new D365Error(
          `Duplicate picklist option value: ${option.value}`,
          "ValidationError",
          "Picklist option values must be unique.",
        );
      }
      seenValues.add(option.value);
    }

    return {
      ...basePayload,
      "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
      OptionSet: {
        "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
        IsGlobal: false,
        OptionSetType: "Picklist",
        Options: options.map((option) => ({
          Value: option.value,
          Label: toLocalizedLabel(option.label),
        })),
      },
    };
  }

  throw new D365Error(
    `Unsupported attributeType: '${attributeType}'`,
    "ValidationError",
    `Supported types in this wave: ${Array.from(SUPPORTED_CREATE_ATTRIBUTE_TYPES).join(", ")}.`,
  );
}

function buildAttributeUpdatePayload(
  args: UpdateAttributeArgs,
  existingAttribute: any,
): { payload: Record<string, unknown>; changedFields: string[] } {
  const payload: Record<string, unknown> = {};
  const changedFields: string[] = [];

  if (typeof args.displayName === "string") {
    const nextDisplayName = args.displayName.trim();
    if (!nextDisplayName) {
      throw new D365Error(
        "displayName cannot be empty",
        "ValidationError",
        "Provide a non-empty displayName or omit the field.",
      );
    }

    const currentDisplayName = getUserLocalizedLabel(existingAttribute.DisplayName);
    if (currentDisplayName !== nextDisplayName) {
      payload.DisplayName = toLocalizedLabel(nextDisplayName);
      changedFields.push("displayName");
    }
  }

  if (typeof args.description === "string") {
    const nextDescription = args.description.trim();
    const currentDescription = getUserLocalizedLabel(existingAttribute.Description) || "";
    if (currentDescription !== nextDescription) {
      payload.Description = toLocalizedLabel(nextDescription);
      changedFields.push("description");
    }
  }

  if (args.requiredLevel) {
    const currentRequiredLevel = existingAttribute.RequiredLevel?.Value;
    if (currentRequiredLevel !== args.requiredLevel) {
      payload.RequiredLevel = { Value: args.requiredLevel };
      changedFields.push("requiredLevel");
    }
  }

  if (typeof args.maxLength === "number") {
    if (existingAttribute.AttributeType !== "String") {
      throw new D365Error(
        "maxLength can only be updated for String attributes",
        "ValidationError",
        "Remove maxLength or use it only with String attributes.",
      );
    }

    if (args.maxLength < 1 || args.maxLength > 4000) {
      throw new D365Error(
        "Invalid maxLength for String attribute",
        "ValidationError",
        "maxLength must be between 1 and 4000.",
      );
    }

    if (existingAttribute.MaxLength !== args.maxLength) {
      payload.MaxLength = args.maxLength;
      changedFields.push("maxLength");
    }
  }

  return { payload, changedFields };
}

/**
 * Tool: describe_entity
 * Get complete entity schema with attributes and relationships
 */
const describeEntityTool: ToolDefinition = {
  name: "describe_entity",
  description:
    "Retrieves complete metadata for a Dynamics 365 entity including attributes, relationships, and keys",
  inputSchema: {
    type: "object",
    properties: {
      entityLogicalName: {
        type: "string",
        description: 'The logical name of the entity (e.g., "account", "contact")',
      },
      includeAttributes: {
        type: "boolean",
        description: "Include attribute metadata (default: true)",
      },
      includeRelationships: {
        type: "boolean",
        description: "Include relationship metadata (default: true)",
      },
    },
    required: ["entityLogicalName"],
  },
  handler: async (args: any, connection: D365Connection) => {
    try {
      const { entityLogicalName, includeAttributes, includeRelationships } = parseToolArgs(
        describeEntityArgsSchema,
        args,
        "describe_entity",
      );
      validateLogicalName(entityLogicalName, "entityLogicalName");
      const safeEntityLogicalName = escapeODataStringLiteral(entityLogicalName);

      // Build the query with expansions
      let query = `/EntityDefinitions(LogicalName='${safeEntityLogicalName}')`;
      const expand: string[] = [];

      if (includeAttributes) {
        expand.push("Attributes");
      }
      if (includeRelationships) {
        expand.push("OneToManyRelationships", "ManyToOneRelationships", "ManyToManyRelationships");
      }

      if (expand.length > 0) {
        query += `?$expand=${expand.join(",")}`;
      }

      const response = await connection.get(query);

      // Format the response
      return parseToolResponse(
        describeEntityResponseSchema,
        {
          logicalName: response.LogicalName,
          schemaName: response.SchemaName,
          displayName: response.DisplayName?.UserLocalizedLabel?.Label,
          objectTypeCode: response.ObjectTypeCode,
          primaryIdAttribute: response.PrimaryIdAttribute,
          primaryNameAttribute: response.PrimaryNameAttribute,
          isCustomEntity: response.IsCustomEntity,
          attributes: includeAttributes
            ? response.Attributes?.map((attr: any) => ({
                logicalName: attr.LogicalName,
                schemaName: attr.SchemaName,
                displayName: attr.DisplayName?.UserLocalizedLabel?.Label,
                attributeType: attr.AttributeType,
                isPrimaryId: attr.IsPrimaryId,
                isPrimaryName: attr.IsPrimaryName,
                isCustomAttribute: attr.IsCustomAttribute,
                requiredLevel: attr.RequiredLevel?.Value,
                maxLength: attr.MaxLength,
              }))
            : undefined,
          relationshipCount: {
            oneToMany: response.OneToManyRelationships?.length || 0,
            manyToOne: response.ManyToOneRelationships?.length || 0,
            manyToMany: response.ManyToManyRelationships?.length || 0,
          },
        },
        "describe_entity",
      );
    } catch (error) {
      return handleError(error);
    }
  },
};

/**
 * Tool: list_entities
 * List all entities in the environment
 */
const listEntitiesTool: ToolDefinition = {
  name: "list_entities",
  description: "Lists all entities in the Dynamics 365 environment with optional filtering",
  inputSchema: {
    type: "object",
    properties: {
      customOnly: {
        type: "boolean",
        description: "Return only custom entities (default: false)",
      },
      searchTerm: {
        type: "string",
        description: "Filter entities by name (partial match)",
      },
    },
  },
  handler: async (args: any, connection: D365Connection) => {
    try {
      const { customOnly, searchTerm } = parseToolArgs(
        listEntitiesArgsSchema,
        args,
        "list_entities",
      );

      let query =
        "/EntityDefinitions?$select=LogicalName,SchemaName,DisplayName,IsCustomEntity,ObjectTypeCode";
      const filters: string[] = [];

      if (customOnly) {
        filters.push("IsCustomEntity eq true");
      }

      if (searchTerm) {
        const safeSearchTerm = escapeODataStringLiteral(searchTerm.toLowerCase());
        filters.push(`contains(LogicalName,'${safeSearchTerm}')`);
      }

      if (filters.length > 0) {
        query += `&$filter=${filters.join(" and ")}`;
      }

      const response = await connection.get(query);

      return parseToolResponse(
        listEntitiesResponseSchema,
        {
          totalCount: response.value.length,
          entities: response.value.map((entity: any) => ({
            logicalName: entity.LogicalName,
            schemaName: entity.SchemaName,
            displayName: entity.DisplayName?.UserLocalizedLabel?.Label,
            isCustomEntity: entity.IsCustomEntity,
            objectTypeCode: entity.ObjectTypeCode,
          })),
        },
        "list_entities",
      );
    } catch (error) {
      return handleError(error);
    }
  },
};

/**
 * Tool: get_attribute_details
 * Get detailed information about a specific attribute
 */
const getAttributeDetailsTool: ToolDefinition = {
  name: "get_attribute_details",
  description: "Retrieves detailed metadata for a specific entity attribute",
  inputSchema: {
    type: "object",
    properties: {
      entityLogicalName: {
        type: "string",
        description: "The logical name of the entity",
      },
      attributeLogicalName: {
        type: "string",
        description: "The logical name of the attribute",
      },
    },
    required: ["entityLogicalName", "attributeLogicalName"],
  },
  handler: async (args: any, connection: D365Connection) => {
    try {
      const { entityLogicalName, attributeLogicalName } = parseToolArgs(
        getAttributeDetailsArgsSchema,
        args,
        "get_attribute_details",
      );
      validateLogicalName(entityLogicalName, "entityLogicalName");
      validateLogicalName(attributeLogicalName, "attributeLogicalName");

      const safeEntityLogicalName = escapeODataStringLiteral(entityLogicalName);
      const safeAttributeLogicalName = escapeODataStringLiteral(attributeLogicalName);

      const query = `/EntityDefinitions(LogicalName='${safeEntityLogicalName}')/Attributes(LogicalName='${safeAttributeLogicalName}')`;
      const response = await connection.get(query);

      return parseToolResponse(
        getAttributeDetailsResponseSchema,
        {
          logicalName: response.LogicalName,
          schemaName: response.SchemaName,
          displayName: response.DisplayName?.UserLocalizedLabel?.Label,
          description: response.Description?.UserLocalizedLabel?.Label,
          attributeType: response.AttributeType,
          isPrimaryId: response.IsPrimaryId,
          isPrimaryName: response.IsPrimaryName,
          isCustomAttribute: response.IsCustomAttribute,
          isValidForCreate: response.IsValidForCreate,
          isValidForUpdate: response.IsValidForUpdate,
          isValidForRead: response.IsValidForRead,
          requiredLevel: response.RequiredLevel?.Value,
          maxLength: response.MaxLength,
          format: response.Format,
          options: response.OptionSet?.Options?.map((opt: any) => ({
            value: opt.Value,
            label: opt.Label?.UserLocalizedLabel?.Label,
          })),
        },
        "get_attribute_details",
      );
    } catch (error) {
      return handleError(error);
    }
  },
};

/**
 * Tool: create_attribute
 * Create a new attribute on an entity with validation and dry-run support
 */
const createAttributeTool: ToolDefinition = {
  name: "create_attribute",
  description: "Creates a new attribute for a Dynamics 365 entity with optional dry-run validation",
  inputSchema: {
    type: "object",
    properties: {
      entityLogicalName: {
        type: "string",
        description: 'The logical name of the target entity (e.g., "account")',
      },
      attributeLogicalName: {
        type: "string",
        description: 'The logical name for the new attribute (e.g., "new_priority")',
      },
      displayName: {
        type: "string",
        description: "Display label for the attribute",
      },
      attributeType: {
        type: "string",
        enum: ["String", "Picklist"],
        description: "Attribute type to create",
      },
      requiredLevel: {
        type: "string",
        enum: ["None", "ApplicationRequired", "Recommended"],
        description: "Required level for the attribute (default: None)",
      },
      maxLength: {
        type: "number",
        description: "Maximum length for String attributes",
      },
      options: {
        type: "array",
        description: "Picklist options. Required for Picklist attributes",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "number" },
          },
          required: ["label", "value"],
        },
      },
      description: {
        type: "string",
        description: "Description for the attribute",
      },
      dryRun: {
        type: "boolean",
        description: "Validate and preview without creating (default: false)",
      },
    },
    required: ["entityLogicalName", "attributeLogicalName", "displayName", "attributeType"],
  },
  handler: async (rawArgs: any, connection: D365Connection) => {
    try {
      const args = parseToolArgs(
        createAttributeArgsSchema,
        rawArgs,
        "create_attribute",
      ) as CreateAttributeArgs;
      const {
        entityLogicalName,
        attributeLogicalName,
        displayName,
        attributeType,
        dryRun = false,
      } = args;

      validateLogicalName(entityLogicalName, "entityLogicalName");
      validateLogicalName(attributeLogicalName, "attributeLogicalName");
      validateRequiredLevel(args.requiredLevel);

      if (!displayName?.trim()) {
        throw new D365Error(
          "displayName is required",
          "ValidationError",
          "Provide a non-empty displayName.",
        );
      }

      if (!SUPPORTED_CREATE_ATTRIBUTE_TYPES.has(attributeType)) {
        throw new D365Error(
          `Unsupported attributeType: '${attributeType}'`,
          "ValidationError",
          `Supported types in this wave: ${Array.from(SUPPORTED_CREATE_ATTRIBUTE_TYPES).join(", ")}.`,
        );
      }

      const warnings: string[] = [];
      if (!attributeLogicalName.includes("_")) {
        warnings.push(
          "attributeLogicalName does not include a publisher prefix. Consider using a prefixed name (e.g., contoso_fieldname).",
        );
      }

      const safeEntityLogicalName = escapeODataStringLiteral(entityLogicalName);
      const safeAttributeLogicalName = escapeODataStringLiteral(attributeLogicalName);
      const attributePath = `/EntityDefinitions(LogicalName='${safeEntityLogicalName}')/Attributes(LogicalName='${safeAttributeLogicalName}')`;

      try {
        await connection.get(attributePath);
        throw new D365Error(
          `Attribute '${attributeLogicalName}' already exists on '${entityLogicalName}'`,
          "ConflictError",
          "Use update_attribute to modify an existing attribute.",
        );
      } catch (error: any) {
        if (error instanceof D365Error) {
          throw error;
        }

        if (error?.response?.status !== 404) {
          throw error;
        }
      }

      const payload = buildAttributeCreatePayload(args);

      if (dryRun) {
        return parseToolResponse(
          createAttributeResponseSchema,
          {
            success: true,
            operation: "validated-only",
            entityLogicalName,
            attributeLogicalName,
            attributeType,
            warnings,
            payloadPreview: payload,
          },
          "create_attribute",
        );
      }

      const createPath = `/EntityDefinitions(LogicalName='${safeEntityLogicalName}')/Attributes`;
      await connection.post(createPath, payload);

      return parseToolResponse(
        createAttributeResponseSchema,
        {
          success: true,
          operation: "created",
          entityLogicalName,
          attributeLogicalName,
          attributeType,
          warnings,
        },
        "create_attribute",
      );
    } catch (error) {
      return handleError(error);
    }
  },
};

/**
 * Tool: update_attribute
 * Update an existing attribute's mutable metadata with validation and dry-run support
 */
const updateAttributeTool: ToolDefinition = {
  name: "update_attribute",
  description: "Updates mutable metadata for an existing Dynamics 365 attribute",
  inputSchema: {
    type: "object",
    properties: {
      entityLogicalName: {
        type: "string",
        description: 'The logical name of the target entity (e.g., "account")',
      },
      attributeLogicalName: {
        type: "string",
        description: 'The logical name of the attribute to update (e.g., "new_priority")',
      },
      displayName: {
        type: "string",
        description: "Optional new display label",
      },
      description: {
        type: "string",
        description: "Optional new description",
      },
      requiredLevel: {
        type: "string",
        enum: ["None", "ApplicationRequired", "Recommended"],
        description: "Optional required level update",
      },
      maxLength: {
        type: "number",
        description: "Optional max length update (String attributes only)",
      },
      dryRun: {
        type: "boolean",
        description: "Validate and preview without updating (default: false)",
      },
    },
    required: ["entityLogicalName", "attributeLogicalName"],
  },
  handler: async (rawArgs: any, connection: D365Connection) => {
    try {
      const args = parseToolArgs(
        updateAttributeArgsSchema,
        rawArgs,
        "update_attribute",
      ) as UpdateAttributeArgs;
      const { entityLogicalName, attributeLogicalName, dryRun = false } = args;

      validateLogicalName(entityLogicalName, "entityLogicalName");
      validateLogicalName(attributeLogicalName, "attributeLogicalName");
      validateRequiredLevel(args.requiredLevel);

      const hasUpdateField =
        args.displayName !== undefined ||
        args.description !== undefined ||
        args.requiredLevel !== undefined ||
        args.maxLength !== undefined;

      if (!hasUpdateField) {
        throw new D365Error(
          "No update fields provided",
          "ValidationError",
          "Provide at least one field to update: displayName, description, requiredLevel, or maxLength.",
        );
      }

      const safeEntityLogicalName = escapeODataStringLiteral(entityLogicalName);
      const safeAttributeLogicalName = escapeODataStringLiteral(attributeLogicalName);
      const attributePath = `/EntityDefinitions(LogicalName='${safeEntityLogicalName}')/Attributes(LogicalName='${safeAttributeLogicalName}')`;

      let existingAttribute: any;
      try {
        existingAttribute = await connection.get(attributePath);
      } catch (error: any) {
        if (error?.response?.status === 404) {
          throw new D365Error(
            `Attribute '${attributeLogicalName}' not found on '${entityLogicalName}'`,
            "NotFoundError",
            "Verify the entity and attribute logical names.",
          );
        }
        throw error;
      }

      if (!existingAttribute?.IsCustomAttribute) {
        throw new D365Error(
          `Attribute '${attributeLogicalName}' is not a custom attribute and cannot be modified by this tool`,
          "ValidationError",
          "Only custom attributes are supported for update operations.",
        );
      }

      const { payload, changedFields } = buildAttributeUpdatePayload(args, existingAttribute);

      if (changedFields.length === 0) {
        return parseToolResponse(
          updateAttributeResponseSchema,
          {
            success: true,
            operation: "no-op",
            entityLogicalName,
            attributeLogicalName,
            changedFields,
            warnings: ["No effective metadata changes detected."],
          },
          "update_attribute",
        );
      }

      if (dryRun) {
        return parseToolResponse(
          updateAttributeResponseSchema,
          {
            success: true,
            operation: "validated-only",
            entityLogicalName,
            attributeLogicalName,
            changedFields,
            payloadPreview: payload,
          },
          "update_attribute",
        );
      }

      await connection.patch(attributePath, payload);

      return parseToolResponse(
        updateAttributeResponseSchema,
        {
          success: true,
          operation: "updated",
          entityLogicalName,
          attributeLogicalName,
          changedFields,
        },
        "update_attribute",
      );
    } catch (error) {
      return handleError(error);
    }
  },
};

/**
 * Register all metadata tools
 */
export function registerMetadataTools(): ToolDefinition[] {
  return [
    describeEntityTool,
    listEntitiesTool,
    getAttributeDetailsTool,
    createAttributeTool,
    updateAttributeTool,
  ];
}
