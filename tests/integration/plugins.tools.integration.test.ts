import { D365Connection } from "../../src/d365/connection.js";
import { registerPluginTools } from "../../src/tools/plugins/index.js";
import { DataverseCleanupRegistry } from "./helpers/dataverse-cleanup.js";
import { createD365IntegrationConfig, getMissingD365EnvVars } from "./helpers/env.js";

const integrationAssemblyName =
  process.env.D365_TEST_PLUGIN_ASSEMBLY_NAME || "Microsoft.Crm.ObjectModel";
const integrationPluginTypeName =
  process.env.D365_TEST_PLUGIN_TYPE_NAME || "Microsoft.Crm.Extensibility.InternalOperationPlugin";

function getPluginToolHandler(toolName: string) {
  const tool = registerPluginTools().find((entry) => entry.name === toolName);
  if (!tool) {
    throw new Error(`${toolName} tool not found`);
  }

  return tool.handler;
}

describe("Plugin tools integration", () => {
  const missing = getMissingD365EnvVars();

  if (missing.length > 0) {
    it("skips plugin integration tests when required env vars are missing", () => {
      console.warn(`Skipping plugin integration tests. Missing env vars: ${missing.join(", ")}`);
      expect(missing.length).toBeGreaterThan(0);
    });
    return;
  }

  const connection = new D365Connection(createD365IntegrationConfig());
  const cleanupRegistry = new DataverseCleanupRegistry();

  beforeAll(async () => {
    await connection.connect();
  }, 30000);

  afterAll(async () => {
    if (!cleanupRegistry.hasRecords()) {
      return;
    }

    const result = await cleanupRegistry.cleanup(connection);
    expect(result.failed).toHaveLength(0);
  }, 30000);

  it("list_plugin_assemblies returns stable shape without plugin types", async () => {
    const handler = getPluginToolHandler("list_plugin_assemblies");
    const result = await handler(
      {
        includeTypes: false,
        assemblyName: integrationAssemblyName,
      },
      connection,
    );

    expect(result.error).toBeUndefined();
    expect(typeof result.totalCount).toBe("number");
    expect(Array.isArray(result.assemblies)).toBe(true);

    if (result.assemblies.length > 0) {
      const first = result.assemblies[0];
      expect(typeof first.id).toBe("string");
      expect(typeof first.name).toBe("string");
      expect(["None", "Sandbox"]).toContain(first.isolationMode);
      expect(["Database", "Disk"]).toContain(first.sourceType);
      expect(first.pluginTypes).toBeUndefined();
    }
  }, 30000);

  it("list_plugin_assemblies includes plugin types when requested", async () => {
    const handler = getPluginToolHandler("list_plugin_assemblies");
    const result = await handler(
      {
        includeTypes: true,
        assemblyName: integrationAssemblyName,
      },
      connection,
    );

    expect(result.error).toBeUndefined();
    expect(Array.isArray(result.assemblies)).toBe(true);

    for (const assembly of result.assemblies) {
      if (assembly.pluginTypes !== undefined) {
        expect(Array.isArray(assembly.pluginTypes)).toBe(true);
      }
    }
  }, 30000);

  it("get_plugin_execution_chain returns grouped stage structure", async () => {
    const handler = getPluginToolHandler("get_plugin_execution_chain");
    const result = await handler(
      {
        entityLogicalName: "account",
        messageName: "Create",
        stage: "All",
      },
      connection,
    );

    if (result.error) {
      expect(["ValidationError", "PermissionError", "ResponseValidationError"]).toContain(
        result.error,
      );
      expect(typeof result.message).toBe("string");
      return;
    }

    expect(result.entity).toBe("account");
    expect(result.message).toBe("Create");
    expect(typeof result.totalPlugins).toBe("number");
    expect(result.stages).toBeDefined();

    expect(typeof result.stages.PreValidation.count).toBe("number");
    expect(Array.isArray(result.stages.PreValidation.plugins)).toBe(true);

    expect(typeof result.stages.PreOperation.count).toBe("number");
    expect(Array.isArray(result.stages.PreOperation.plugins)).toBe(true);

    expect(typeof result.stages.PostOperation.count).toBe("number");
    expect(Array.isArray(result.stages.PostOperation.plugins)).toBe(true);
  }, 30000);

  it("get_plugin_execution_chain respects stage filter", async () => {
    const handler = getPluginToolHandler("get_plugin_execution_chain");
    const result = await handler(
      {
        entityLogicalName: "account",
        messageName: "Create",
        stage: "PreOperation",
      },
      connection,
    );

    if (result.error) {
      expect(["ValidationError", "PermissionError", "ResponseValidationError"]).toContain(
        result.error,
      );
      expect(typeof result.message).toBe("string");
      return;
    }

    expect(result.stages.PreValidation.count).toBe(0);
    expect(result.stages.PostOperation.count).toBe(0);
  }, 30000);

  it("analyze_plugin_trace_logs returns structured exception analysis in all mode", async () => {
    const handler = getPluginToolHandler("analyze_plugin_trace_logs");
    const result = await handler(
      {
        mode: "all",
        count: 20,
      },
      connection,
    );

    if (result.error) {
      expect(["ValidationError", "PermissionError", "ResponseValidationError"]).toContain(
        result.error,
      );
      expect(typeof result.message).toBe("string");
      return;
    }

    expect(result.mode).toBe("all");
    expect(typeof result.totalExceptions).toBe("number");
    expect(result.filters.count).toBe(20);
    expect(Array.isArray(result.summary.byExceptionType)).toBe(true);
    expect(Array.isArray(result.summary.byPlugin)).toBe(true);
    expect(Array.isArray(result.exceptions)).toBe(true);
  }, 30000);

  it("analyze_plugin_trace_logs supports assembly mode", async () => {
    const handler = getPluginToolHandler("analyze_plugin_trace_logs");
    const result = await handler(
      {
        mode: "assembly",
        assemblyName: integrationAssemblyName,
        count: 10,
      },
      connection,
    );

    if (result.error) {
      expect([
        "ValidationError",
        "PermissionError",
        "ResponseValidationError",
        "NotFoundError",
      ]).toContain(result.error);
      expect(typeof result.message).toBe("string");
      return;
    }

    expect(result.mode).toBe("assembly");
    expect(result.filters.assemblyName).toBe(integrationAssemblyName);
    expect(typeof result.totalExceptions).toBe("number");
  }, 30000);

  it("analyze_plugin_trace_logs supports plugin mode with date filter", async () => {
    const handler = getPluginToolHandler("analyze_plugin_trace_logs");
    const result = await handler(
      {
        mode: "plugin",
        pluginTypeName: integrationPluginTypeName,
        fromDate: "2026-01-01T00:00:00Z",
        count: 10,
      },
      connection,
    );

    if (result.error) {
      expect(["ValidationError", "PermissionError", "ResponseValidationError"]).toContain(
        result.error,
      );
      expect(typeof result.message).toBe("string");
      return;
    }

    expect(result.mode).toBe("plugin");
    expect(result.filters.pluginTypeName).toBe(integrationPluginTypeName);
    expect(result.filters.fromDate).toBe("2026-01-01T00:00:00Z");
    expect(typeof result.totalExceptions).toBe("number");
  }, 30000);
});
