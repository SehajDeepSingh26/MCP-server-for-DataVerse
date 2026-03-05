/**
 * Plugin Tools Registration
 *
 * Tools for analyzing plugin execution chains and plugin metadata
 */

import { ToolDefinition, PluginStep, PluginStage, PluginMode } from "../../types/index.js";
import { D365Connection } from "../../d365/connection.js";
import { D365Error, handleError } from "../../utils/error-handler.js";
import { parseToolArgs, parseToolResponse } from "../../utils/zod-validation.js";
import {
  escapeODataStringLiteral,
  validateLogicalName,
  validateSdkMessageName,
} from "../../utils/odata.js";
import { z } from "zod";

const getPluginExecutionChainArgsSchema = z
  .object({
    entityLogicalName: z.string(),
    messageName: z.string().min(1),
    stage: z
      .enum(["PreValidation", "PreOperation", "PostOperation", "All"])
      .optional()
      .default("All"),
  })
  .strict();

const listPluginAssembliesArgsSchema = z
  .object({
    includeTypes: z.boolean().optional().default(false),
    assembly: z.string().min(1).optional(),
    assemblyName: z.string().min(1).optional(),
    assemblyNames: z.array(z.string().min(1)).min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const selectorCount = [value.assembly, value.assemblyName, value.assemblyNames].filter(
      (entry) => entry !== undefined,
    ).length;

    if (selectorCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either one of assembly or assemblyName must be provided.",
        path: ["assemblyName"],
      });
    }

    if (selectorCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use only one selector: assembly, assemblyName, or assemblyNames.",
        path: ["assemblyNames"],
      });
    }
  });

const analyzePluginTraceLogsArgsSchema = z
  .object({
    mode: z.enum(["all", "assembly", "plugin"]).optional().default("all"),
    assemblyName: z.string().min(1).optional(),
    pluginTypeName: z.string().min(1).optional(),
    fromDate: z.string().datetime().optional(),
    count: z.number().int().min(1).max(200).optional().default(50),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "assembly" && !value.assemblyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "assemblyName is required when mode is 'assembly'.",
        path: ["assemblyName"],
      });
    }

    if (value.mode === "plugin" && !value.pluginTypeName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pluginTypeName is required when mode is 'plugin'.",
        path: ["pluginTypeName"],
      });
    }
  });

const pluginStepResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    pluginTypeName: z.string(),
    entityName: z.string(),
    message: z.string(),
    stage: z.nativeEnum(PluginStage),
    executionOrder: z.number(),
    mode: z.nativeEnum(PluginMode),
    filteringAttributes: z.array(z.string()).optional(),
    images: z.array(z.unknown()),
    isEnabled: z.boolean(),
  })
  .strict();

const getPluginExecutionChainResponseSchema = z
  .object({
    entity: z.string(),
    message: z.string(),
    totalPlugins: z.number(),
    stages: z
      .object({
        PreValidation: z
          .object({ count: z.number(), plugins: z.array(pluginStepResponseSchema) })
          .strict(),
        PreOperation: z
          .object({ count: z.number(), plugins: z.array(pluginStepResponseSchema) })
          .strict(),
        PostOperation: z
          .object({ count: z.number(), plugins: z.array(pluginStepResponseSchema) })
          .strict(),
      })
      .strict(),
    warnings: z.array(z.string()),
  })
  .strict();

const listPluginAssembliesResponseSchema = z
  .object({
    totalCount: z.number(),
    assemblies: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          version: z.string().nullable().optional(),
          isolationMode: z.enum(["None", "Sandbox"]),
          sourceType: z.enum(["Database", "Disk"]),
          pluginTypes: z
            .array(
              z
                .object({
                  name: z.string().nullable().optional(),
                  typeName: z.string().nullable().optional(),
                })
                .strict(),
            )
            .optional(),
        })
        .strict(),
    ),
  })
  .strict();

const analyzedTraceExceptionSchema = z
  .object({
    id: z.string(),
    createdOn: z.string().nullable().optional(),
    pluginTypeName: z.string().nullable().optional(),
    messageBlock: z.string().nullable().optional(),
    exceptionDetails: z.string().nullable().optional(),
    exceptionType: z.string().nullable().optional(),
    exceptionMessage: z.string().nullable().optional(),
    correlationId: z.string().nullable().optional(),
  })
  .strict();

const analyzePluginTraceLogsResponseSchema = z
  .object({
    mode: z.enum(["all", "assembly", "plugin"]),
    totalExceptions: z.number(),
    filters: z
      .object({
        count: z.number(),
        fromDate: z.string().optional(),
        assemblyName: z.string().optional(),
        pluginTypeName: z.string().optional(),
      })
      .strict(),
    summary: z
      .object({
        byExceptionType: z.array(
          z
            .object({
              exceptionType: z.string(),
              count: z.number(),
            })
            .strict(),
        ),
        byPlugin: z.array(
          z
            .object({
              pluginTypeName: z.string(),
              count: z.number(),
            })
            .strict(),
        ),
      })
      .strict(),
    exceptions: z.array(analyzedTraceExceptionSchema),
  })
  .strict();

type TraceLogMode = "all" | "assembly" | "plugin";

function extractExceptionType(rawText?: string | null): string {
  const text = rawText || "";
  const match = text.match(/([A-Za-z_][A-Za-z0-9_.]*Exception)\b/);
  return match?.[1] || "UnknownException";
}

function extractExceptionMessage(rawText?: string | null): string {
  const text = (rawText || "").trim();
  if (!text) {
    return "";
  }

  const firstLine =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) || "";
  return firstLine.slice(0, 500);
}

function buildPluginTraceLogQuery(params: {
  count: number;
  fromDate?: string;
  pluginTypeNames?: string[];
}): string {
  const { count, fromDate, pluginTypeNames } = params;

  const filters: string[] = ["exceptiondetails ne null"];

  if (fromDate) {
    filters.push(`createdon ge ${fromDate}`);
  }

  if (pluginTypeNames && pluginTypeNames.length > 0) {
    const pluginFilters = pluginTypeNames
      .map((pluginTypeName) => `typename eq '${escapeODataStringLiteral(pluginTypeName)}'`)
      .join(" or ");
    filters.push(`(${pluginFilters})`);
  }

  return `/plugintracelogs?$select=plugintracelogid,typename,messageblock,exceptiondetails,createdon,correlationid&$filter=${filters.join(" and ")}&$orderby=createdon desc&$top=${count}`;
}

function summarizeExceptionLogs(
  exceptions: Array<{ exceptionType: string; pluginTypeName: string }>,
): {
  byExceptionType: Array<{ exceptionType: string; count: number }>;
  byPlugin: Array<{ pluginTypeName: string; count: number }>;
} {
  const exceptionTypeCount = new Map<string, number>();
  const pluginCount = new Map<string, number>();

  for (const exception of exceptions) {
    exceptionTypeCount.set(
      exception.exceptionType,
      (exceptionTypeCount.get(exception.exceptionType) || 0) + 1,
    );
    pluginCount.set(exception.pluginTypeName, (pluginCount.get(exception.pluginTypeName) || 0) + 1);
  }

  const byExceptionType = Array.from(exceptionTypeCount.entries())
    .map(([exceptionType, count]) => ({ exceptionType, count }))
    .sort((a, b) => b.count - a.count);

  const byPlugin = Array.from(pluginCount.entries())
    .map(([pluginTypeName, count]) => ({ pluginTypeName, count }))
    .sort((a, b) => b.count - a.count);

  return {
    byExceptionType,
    byPlugin,
  };
}

/**
 * Tool: get_plugin_execution_chain
 * Retrieves the complete plugin execution chain for an entity and message
 */
const getPluginExecutionChainTool: ToolDefinition = {
  name: "get_plugin_execution_chain",
  description:
    "Retrieves the complete plugin execution chain for a specific entity and SDK message, ordered by stage and execution order",
  inputSchema: {
    type: "object",
    properties: {
      entityLogicalName: {
        type: "string",
        description: 'The logical name of the entity (e.g., "account", "contact")',
      },
      messageName: {
        type: "string",
        description: 'The SDK message name (e.g., "Create", "Update", "Delete", "Assign")',
      },
      stage: {
        type: "string",
        enum: ["PreValidation", "PreOperation", "PostOperation", "All"],
        description: "Filter by execution stage (default: All)",
      },
    },
    required: ["entityLogicalName", "messageName"],
  },
  handler: async (args: any, connection: D365Connection) => {
    try {
      const { entityLogicalName, messageName, stage } = parseToolArgs(
        getPluginExecutionChainArgsSchema,
        args,
        "get_plugin_execution_chain",
      );
      validateLogicalName(entityLogicalName, "entityLogicalName");
      validateSdkMessageName(messageName);

      const safeEntityLogicalName = escapeODataStringLiteral(entityLogicalName);
      const safeMessageName = escapeODataStringLiteral(messageName);

      // Build the query
      let filter = `primaryobjectidname eq '${safeEntityLogicalName}'`;
      filter += ` and sdkmessagefilterid/sdkmessageid/name eq '${safeMessageName}'`;
      filter += ` and statecode eq 0`; // Only enabled steps

      if (stage !== "All") {
        const stageValue = stage === "PreValidation" ? 10 : stage === "PreOperation" ? 20 : 40;
        filter += ` and stage eq ${stageValue}`;
      }

      const query = `/sdkmessageprocessingsteps?$filter=${filter}&$select=sdkmessageprocessingstepid,name,stage,rank,mode,filteringattributes,statecode&$expand=plugintypeid($select=typename),sdkmessagefilterid($select=primaryobjectidname;$expand=sdkmessageid($select=name))&$orderby=stage,rank`;

      const response = await connection.get(query);

      const plugins: PluginStep[] = response.value.map((step: any) => ({
        id: step.sdkmessageprocessingstepid,
        name: step.name,
        pluginTypeName: step.plugintypeid?.typename || "Unknown",
        entityName: step.sdkmessagefilterid?.primaryobjectidname || entityLogicalName,
        message: step.sdkmessagefilterid?.sdkmessageid?.name || messageName,
        stage: step.stage as PluginStage,
        executionOrder: step.rank,
        mode: step.mode as PluginMode,
        filteringAttributes: step.filteringattributes ? step.filteringattributes.split(",") : [],
        isEnabled: step.statecode === 0,
        images: [], // Images would require additional query
      }));

      // Group by stage
      const groupedByStage = {
        preValidation: plugins.filter((p) => p.stage === PluginStage.PreValidation),
        preOperation: plugins.filter((p) => p.stage === PluginStage.PreOperation),
        postOperation: plugins.filter((p) => p.stage === PluginStage.PostOperation),
      };

      return parseToolResponse(
        getPluginExecutionChainResponseSchema,
        {
          entity: entityLogicalName,
          message: messageName,
          totalPlugins: plugins.length,
          stages: {
            PreValidation: {
              count: groupedByStage.preValidation.length,
              plugins: groupedByStage.preValidation,
            },
            PreOperation: {
              count: groupedByStage.preOperation.length,
              plugins: groupedByStage.preOperation,
            },
            PostOperation: {
              count: groupedByStage.postOperation.length,
              plugins: groupedByStage.postOperation,
            },
          },
          warnings: generateWarnings(plugins),
        },
        "get_plugin_execution_chain",
      );
    } catch (error) {
      return handleError(error);
    }
  },
};

/**
 * Tool: list_plugin_assemblies
 * List all registered plugin assemblies
 */
const listPluginAssembliesTool: ToolDefinition = {
  name: "list_plugin_assemblies",
  description:
    "Lists unmanaged plugin assemblies by exact name selector. Provide assembly, assemblyName, or assemblyNames",
  inputSchema: {
    type: "object",
    properties: {
      includeTypes: {
        type: "boolean",
        description: "Include plugin types for each assembly (default: false)",
      },
      assembly: {
        type: "string",
        description: "Exact assembly name filter (alias of assemblyName)",
      },
      assemblyName: {
        type: "string",
        description: "Exact assembly name to filter by (case-sensitive exact match)",
      },
      assemblyNames: {
        type: "array",
        description: "List of exact assembly names to filter by (case-sensitive exact matches)",
        items: {
          type: "string",
        },
      },
    },
  },
  handler: async (args: any, connection: D365Connection) => {
    try {
      const parsedArgs = parseToolArgs(
        listPluginAssembliesArgsSchema,
        args,
        "list_plugin_assemblies",
      );
      const { includeTypes, assembly, assemblyName, assemblyNames } = parsedArgs;

      let query =
        "/pluginassemblies?$select=name,version,pluginassemblyid,isolationmode,sourcetype";
      const filters: string[] = ["ismanaged eq false"];

      const normalizedAssemblyNames = [
        ...(assembly ? [assembly] : []),
        ...(assemblyName ? [assemblyName] : []),
        ...(assemblyNames ?? []),
      ].map((name) => name.trim());

      if (normalizedAssemblyNames.length > 0) {
        const exactNameFilters = normalizedAssemblyNames
          .map((name) => `name eq '${escapeODataStringLiteral(name)}'`)
          .join(" or ");
        filters.push(`(${exactNameFilters})`);
      }

      query += `&$filter=${filters.join(" and ")}`;

      if (includeTypes) {
        query += "&$expand=pluginassembly_plugintype($select=typename,name)";
      }

      const response = await connection.get(query);

      return parseToolResponse(
        listPluginAssembliesResponseSchema,
        {
          totalCount: response.value.length,
          assemblies: response.value.map((assembly: any) => ({
            id: assembly.pluginassemblyid,
            name: assembly.name,
            version: assembly.version,
            isolationMode: assembly.isolationmode === 1 ? "None" : "Sandbox",
            sourceType: assembly.sourcetype === 0 ? "Database" : "Disk",
            pluginTypes: includeTypes
              ? assembly.pluginassembly_plugintype?.map((type: any) => ({
                  name: type.name,
                  typeName: type.typename,
                }))
              : undefined,
          })),
        },
        "list_plugin_assemblies",
      );
    } catch (error) {
      return handleError(error);
    }
  },
};

/**
 * Tool: analyze_plugin_trace_logs
 * Scan and summarize plugin trace logs containing exceptions
 */
const analyzePluginTraceLogsTool: ToolDefinition = {
  name: "analyze_plugin_trace_logs",
  description:
    "Scans plugin trace logs for exceptions and analyzes them by all logs, assembly, or plugin type",
  inputSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["all", "assembly", "plugin"],
        description: "Analysis mode (default: all)",
      },
      assemblyName: {
        type: "string",
        description: "Required when mode=assembly. Exact plugin assembly name",
      },
      pluginTypeName: {
        type: "string",
        description: "Required when mode=plugin. Exact plugin type name",
      },
      fromDate: {
        type: "string",
        description: "Optional ISO datetime filter (e.g., 2026-01-01T00:00:00Z)",
      },
      count: {
        type: "number",
        description: "Optional max number of logs to return (1-200, default: 50)",
      },
    },
  },
  handler: async (args: any, connection: D365Connection) => {
    try {
      const parsedArgs = parseToolArgs(
        analyzePluginTraceLogsArgsSchema,
        args,
        "analyze_plugin_trace_logs",
      );

      const { mode, assemblyName, pluginTypeName, fromDate, count } = parsedArgs;
      const normalizedCount = count ?? 50;
      let pluginTypeNames: string[] | undefined;

      if (mode === "assembly") {
        const safeAssemblyName = escapeODataStringLiteral(assemblyName!);
        const assemblyQuery = `/pluginassemblies?$select=pluginassemblyid,name&$filter=name eq '${safeAssemblyName}'&$expand=pluginassembly_plugintype($select=typename)`;
        const assemblyResponse = await connection.get(assemblyQuery);

        const assembly = assemblyResponse.value?.[0];
        if (!assembly) {
          throw new D365Error(
            `Assembly '${assemblyName}' not found`,
            "NotFoundError",
            "Verify the assembly name and provide an exact match.",
          );
        }

        const assemblyPluginTypeNames = (assembly.pluginassembly_plugintype || [])
          .map((pluginType: any) => String(pluginType?.typename || "").trim())
          .filter((name: string) => name.length > 0);

        if (assemblyPluginTypeNames.length === 0) {
          throw new D365Error(
            `Assembly '${assemblyName}' has no plugin types`,
            "NotFoundError",
            "Check plugin type registration for this assembly.",
          );
        }

        pluginTypeNames = assemblyPluginTypeNames;
      }

      if (mode === "plugin") {
        pluginTypeNames = [pluginTypeName!];
      }

      const traceQuery = buildPluginTraceLogQuery({
        count: normalizedCount,
        fromDate,
        pluginTypeNames,
      });

      const traceResponse = await connection.get(traceQuery);

      const analyzedExceptions = (traceResponse.value || []).map((log: any) => {
        const exceptionDetails = log.exceptiondetails || null;
        const messageBlock = log.messageblock || null;
        const exceptionSource = exceptionDetails || messageBlock;
        const parsedExceptionType = extractExceptionType(exceptionSource);
        const parsedExceptionMessage = extractExceptionMessage(exceptionSource);

        return {
          id: String(log.plugintracelogid),
          createdOn: log.createdon || null,
          pluginTypeName: log.typename || null,
          messageBlock,
          exceptionDetails,
          exceptionType: parsedExceptionType,
          exceptionMessage: parsedExceptionMessage || null,
          correlationId: log.correlationid || null,
        };
      });

      const summary = summarizeExceptionLogs(
        analyzedExceptions.map((entry: any) => ({
          exceptionType: entry.exceptionType || "UnknownException",
          pluginTypeName: entry.pluginTypeName || "UnknownPlugin",
        })),
      );

      return parseToolResponse(
        analyzePluginTraceLogsResponseSchema,
        {
          mode: mode as TraceLogMode,
          totalExceptions: analyzedExceptions.length,
          filters: {
            count: normalizedCount,
            fromDate,
            assemblyName,
            pluginTypeName,
          },
          summary,
          exceptions: analyzedExceptions,
        },
        "analyze_plugin_trace_logs",
      );
    } catch (error) {
      return handleError(error);
    }
  },
};

/**
 * Generate warnings for plugin configuration issues
 */
function generateWarnings(plugins: PluginStep[]): string[] {
  const warnings: string[] = [];

  // Check for multiple synchronous plugins in the same stage
  const syncByStage = new Map<PluginStage, number>();
  plugins.forEach((plugin) => {
    if (plugin.mode === PluginMode.Synchronous) {
      const count = syncByStage.get(plugin.stage) || 0;
      syncByStage.set(plugin.stage, count + 1);
    }
  });

  syncByStage.forEach((count, stage) => {
    if (count > 2) {
      const stageName =
        stage === 10 ? "PreValidation" : stage === 20 ? "PreOperation" : "PostOperation";
      warnings.push(`${count} synchronous plugins in ${stageName} stage may impact performance`);
    }
  });

  // Check for duplicate execution orders
  const orderMap = new Map<string, number>();
  plugins.forEach((plugin) => {
    const key = `${plugin.stage}-${plugin.executionOrder}`;
    const count = orderMap.get(key) || 0;
    orderMap.set(key, count + 1);
  });

  orderMap.forEach((count, key) => {
    if (count > 1) {
      warnings.push(
        `${count} plugins have the same execution order (${key}). Execution sequence is not guaranteed.`,
      );
    }
  });

  return warnings;
}

/**
 * Register all plugin tools
 */
export function registerPluginTools(): ToolDefinition[] {
  return [getPluginExecutionChainTool, listPluginAssembliesTool, analyzePluginTraceLogsTool];
}
