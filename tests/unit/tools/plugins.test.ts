import { registerPluginTools } from "../../../src/tools/plugins/index.js";

function getToolHandler(toolName: string) {
  const tool = registerPluginTools().find((entry) => entry.name === toolName);
  if (!tool) {
    throw new Error(`${toolName} tool not found`);
  }

  return tool.handler;
}

describe("plugin tools", () => {
  describe("get_plugin_execution_chain", () => {
    it("returns grouped plugin chain with warnings", async () => {
      const handler = getToolHandler("get_plugin_execution_chain");

      const connection = {
        get: jest.fn().mockResolvedValue({
          value: [
            {
              sdkmessageprocessingstepid: "step-1",
              name: "Validate Account",
              stage: 20,
              rank: 1,
              mode: 0,
              filteringattributes: "name,accountnumber",
              statecode: 0,
              plugintypeid: { typename: "Contoso.Plugins.ValidateAccount" },
              sdkmessagefilterid: {
                primaryobjectidname: "account",
                sdkmessageid: { name: "Create" },
              },
            },
            {
              sdkmessageprocessingstepid: "step-2",
              name: "Enrich Account",
              stage: 20,
              rank: 1,
              mode: 0,
              filteringattributes: null,
              statecode: 0,
              plugintypeid: { typename: "Contoso.Plugins.EnrichAccount" },
              sdkmessagefilterid: {
                primaryobjectidname: "account",
                sdkmessageid: { name: "Create" },
              },
            },
            {
              sdkmessageprocessingstepid: "step-3",
              name: "Audit Account",
              stage: 20,
              rank: 3,
              mode: 0,
              filteringattributes: "name",
              statecode: 0,
              plugintypeid: { typename: "Contoso.Plugins.AuditAccount" },
              sdkmessagefilterid: {
                primaryobjectidname: "account",
                sdkmessageid: { name: "Create" },
              },
            },
            {
              sdkmessageprocessingstepid: "step-4",
              name: "Post Create Notification",
              stage: 40,
              rank: 1,
              mode: 1,
              filteringattributes: "name",
              statecode: 0,
              plugintypeid: { typename: "Contoso.Plugins.Notify" },
              sdkmessagefilterid: {
                primaryobjectidname: "account",
                sdkmessageid: { name: "Create" },
              },
            },
          ],
        }),
      };

      const result = await handler(
        {
          entityLogicalName: "account",
          messageName: "Create",
          stage: "All",
        },
        connection,
      );

      expect(result.totalPlugins).toBe(4);
      expect(result.stages.PreOperation.count).toBe(3);
      expect(result.stages.PostOperation.count).toBe(1);
      expect(result.stages.PreOperation.plugins[0].id).toBe("step-1");
      expect(result.stages.PreOperation.plugins[0].filteringAttributes).toEqual([
        "name",
        "accountnumber",
      ]);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining("3 synchronous plugins in PreOperation"),
          expect.stringContaining("same execution order (20-1)"),
        ]),
      );
    });

    it("adds stage filter when specific stage is requested", async () => {
      const handler = getToolHandler("get_plugin_execution_chain");
      const connection = {
        get: jest.fn().mockResolvedValue({ value: [] }),
      };

      await handler(
        {
          entityLogicalName: "account",
          messageName: "Update",
          stage: "PreOperation",
        },
        connection,
      );

      const query = String(connection.get.mock.calls[0][0]);
      expect(query).toContain("stage eq 20");
      expect(query).toContain("sdkmessageprocessingstepid");
    });

    it("returns validation error for invalid logical name", async () => {
      const handler = getToolHandler("get_plugin_execution_chain");
      const connection = {
        get: jest.fn(),
      };

      const result = await handler(
        {
          entityLogicalName: "bad-name",
          messageName: "Create",
        },
        connection,
      );

      expect(result.error).toBe("ValidationError");
      expect(connection.get).not.toHaveBeenCalled();
    });

    it("returns validation error for invalid stage enum", async () => {
      const handler = getToolHandler("get_plugin_execution_chain");
      const connection = {
        get: jest.fn(),
      };

      const result = await handler(
        {
          entityLogicalName: "account",
          messageName: "Create",
          stage: "PreOp",
        },
        connection,
      );

      expect(result.error).toBe("ValidationError");
      expect(connection.get).not.toHaveBeenCalled();
    });

    it("maps backend error responses", async () => {
      const handler = getToolHandler("get_plugin_execution_chain");
      const connection = {
        get: jest.fn().mockRejectedValue({ message: "Forbidden", response: { status: 403 } }),
      };

      const result = await handler(
        {
          entityLogicalName: "account",
          messageName: "Create",
        },
        connection,
      );

      expect(result.error).toBe("PermissionError");
    });

    it("returns ResponseValidationError when mapped plugin payload has invalid type", async () => {
      const handler = getToolHandler("get_plugin_execution_chain");
      const connection = {
        get: jest.fn().mockResolvedValue({
          value: [
            {
              sdkmessageprocessingstepid: "step-1",
              name: "Invalid Payload Plugin",
              stage: 20,
              rank: "1",
              mode: 0,
              filteringattributes: null,
              statecode: 0,
              plugintypeid: { typename: "Contoso.Plugins.Invalid" },
              sdkmessagefilterid: {
                primaryobjectidname: "account",
                sdkmessageid: { name: "Create" },
              },
            },
          ],
        }),
      };

      const result = await handler(
        {
          entityLogicalName: "account",
          messageName: "Create",
        },
        connection,
      );

      expect(result.error).toBe("ResponseValidationError");
    });
  });

  describe("list_plugin_assemblies", () => {
    it("lists assemblies without types by default when assembly selector is provided", async () => {
      const handler = getToolHandler("list_plugin_assemblies");
      const connection = {
        get: jest.fn().mockResolvedValue({
          value: [
            {
              pluginassemblyid: "assembly-1",
              name: "Contoso.Plugins",
              version: "1.0.0.0",
              isolationmode: 2,
              sourcetype: 0,
            },
          ],
        }),
      };

      const result = await handler({ assemblyName: "Contoso.Plugins" }, connection);

      expect(result.totalCount).toBe(1);
      expect(result.assemblies[0].isolationMode).toBe("Sandbox");
      expect(result.assemblies[0].sourceType).toBe("Database");
      expect(result.assemblies[0].pluginTypes).toBeUndefined();
    });

    it("includes plugin types when requested", async () => {
      const handler = getToolHandler("list_plugin_assemblies");
      const connection = {
        get: jest.fn().mockResolvedValue({
          value: [
            {
              pluginassemblyid: "assembly-1",
              name: "Contoso.Plugins",
              version: "1.0.0.0",
              isolationmode: 1,
              sourcetype: 1,
              pluginassembly_plugintype: [
                { name: "Validate", typename: "Contoso.Plugins.Validate" },
              ],
            },
          ],
        }),
      };

      const result = await handler(
        { includeTypes: true, assemblyName: "Contoso.Plugins" },
        connection,
      );

      expect(result.assemblies[0].isolationMode).toBe("None");
      expect(result.assemblies[0].sourceType).toBe("Disk");
      expect(result.assemblies[0].pluginTypes).toEqual([
        { name: "Validate", typeName: "Contoso.Plugins.Validate" },
      ]);

      const query = String(connection.get.mock.calls[0][0]);
      expect(query).toContain("ismanaged eq false");
      expect(query).toContain("name eq 'Contoso.Plugins'");
      expect(query).toContain("$expand=pluginassembly_plugintype");
    });

    it("returns validation error when includeTypes is not boolean", async () => {
      const handler = getToolHandler("list_plugin_assemblies");
      const connection = {
        get: jest.fn(),
      };

      const result = await handler({ includeTypes: "yes" }, connection);

      expect(result.error).toBe("ValidationError");
      expect(connection.get).not.toHaveBeenCalled();
    });

    it("returns validation error when no assembly selector is provided", async () => {
      const handler = getToolHandler("list_plugin_assemblies");
      const connection = {
        get: jest.fn(),
      };

      const result = await handler({ includeTypes: false }, connection);

      expect(result.error).toBe("ValidationError");
      expect(connection.get).not.toHaveBeenCalled();
    });

    it("adds exact filter when assemblyName is provided", async () => {
      const handler = getToolHandler("list_plugin_assemblies");
      const connection = {
        get: jest.fn().mockResolvedValue({ value: [] }),
      };

      await handler({ assemblyName: "Contoso.Plugins" }, connection);

      const query = String(connection.get.mock.calls[0][0]);
      expect(query).toContain("ismanaged eq false");
      expect(query).toContain("name eq 'Contoso.Plugins'");
    });

    it("adds exact filter when assembly alias is provided", async () => {
      const handler = getToolHandler("list_plugin_assemblies");
      const connection = {
        get: jest.fn().mockResolvedValue({ value: [] }),
      };

      await handler({ assembly: "Contoso.Legacy" }, connection);

      const query = String(connection.get.mock.calls[0][0]);
      expect(query).toContain("ismanaged eq false");
      expect(query).toContain("name eq 'Contoso.Legacy'");
    });

    it("adds OR exact filters when assemblyNames list is provided", async () => {
      const handler = getToolHandler("list_plugin_assemblies");
      const connection = {
        get: jest.fn().mockResolvedValue({ value: [] }),
      };

      await handler({ assemblyNames: ["Contoso.A", "Contoso.B"] }, connection);

      const query = String(connection.get.mock.calls[0][0]);
      expect(query).toContain("ismanaged eq false");
      expect(query).toContain("name eq 'Contoso.A' or name eq 'Contoso.B'");
    });

    it("returns validation error when both assemblyName and assemblyNames are provided", async () => {
      const handler = getToolHandler("list_plugin_assemblies");
      const connection = {
        get: jest.fn(),
      };

      const result = await handler(
        {
          assemblyName: "Contoso.A",
          assemblyNames: ["Contoso.B"],
        },
        connection,
      );

      expect(result.error).toBe("ValidationError");
      expect(connection.get).not.toHaveBeenCalled();
    });
  });

  describe("analyze_plugin_trace_logs", () => {
    it("returns exception summary in all mode", async () => {
      const handler = getToolHandler("analyze_plugin_trace_logs");
      const connection = {
        get: jest.fn().mockResolvedValue({
          value: [
            {
              plugintracelogid: "log-1",
              typename: "Contoso.Plugins.AccountPlugin",
              messageblock: "System.InvalidOperationException: bad state",
              exceptiondetails: "System.InvalidOperationException: bad state\n at method()",
              createdon: "2026-02-15T10:00:00Z",
              correlationid: "corr-1",
            },
            {
              plugintracelogid: "log-2",
              typename: "Contoso.Plugins.AccountPlugin",
              messageblock: "System.ArgumentException: bad argument",
              exceptiondetails: "System.ArgumentException: bad argument\n at another()",
              createdon: "2026-02-15T09:00:00Z",
              correlationid: "corr-2",
            },
          ],
        }),
      };

      const result = await handler({ mode: "all", count: 10 }, connection);

      expect(result.error).toBeUndefined();
      expect(result.mode).toBe("all");
      expect(result.totalExceptions).toBe(2);
      expect(result.summary.byExceptionType[0].count).toBeGreaterThan(0);

      const query = String(connection.get.mock.calls[0][0]);
      expect(query).toContain("/plugintracelogs?");
      expect(query).toContain("exceptiondetails ne null");
      expect(query).toContain("$top=10");
    });

    it("resolves assembly mode by plugin types and filters trace logs", async () => {
      const handler = getToolHandler("analyze_plugin_trace_logs");
      const connection = {
        get: jest
          .fn()
          .mockResolvedValueOnce({
            value: [
              {
                pluginassemblyid: "assembly-1",
                name: "Contoso.Plugins",
                pluginassembly_plugintype: [{ typename: "Contoso.Plugins.AccountPlugin" }],
              },
            ],
          })
          .mockResolvedValueOnce({
            value: [
              {
                plugintracelogid: "log-1",
                typename: "Contoso.Plugins.AccountPlugin",
                exceptiondetails: "System.InvalidOperationException: bad state",
                createdon: "2026-02-15T10:00:00Z",
              },
            ],
          }),
      };

      const result = await handler(
        {
          mode: "assembly",
          assemblyName: "Contoso.Plugins",
          count: 5,
        },
        connection,
      );

      expect(result.error).toBeUndefined();
      expect(result.mode).toBe("assembly");
      expect(connection.get).toHaveBeenCalledTimes(2);

      const traceQuery = String(connection.get.mock.calls[1][0]);
      expect(traceQuery).toContain("typename eq 'Contoso.Plugins.AccountPlugin'");
      expect(traceQuery).toContain("$top=5");
    });

    it("filters directly by plugin type in plugin mode", async () => {
      const handler = getToolHandler("analyze_plugin_trace_logs");
      const connection = {
        get: jest.fn().mockResolvedValue({ value: [] }),
      };

      const result = await handler(
        {
          mode: "plugin",
          pluginTypeName: "Contoso.Plugins.AccountPlugin",
          fromDate: "2026-01-01T00:00:00Z",
          count: 25,
        },
        connection,
      );

      expect(result.error).toBeUndefined();
      const query = String(connection.get.mock.calls[0][0]);
      expect(query).toContain("typename eq 'Contoso.Plugins.AccountPlugin'");
      expect(query).toContain("createdon ge 2026-01-01T00:00:00Z");
      expect(query).toContain("$top=25");
    });

    it("returns validation error when assembly mode lacks assemblyName", async () => {
      const handler = getToolHandler("analyze_plugin_trace_logs");
      const connection = {
        get: jest.fn(),
      };

      const result = await handler({ mode: "assembly" }, connection);

      expect(result.error).toBe("ValidationError");
      expect(connection.get).not.toHaveBeenCalled();
    });

    it("returns validation error when plugin mode lacks pluginTypeName", async () => {
      const handler = getToolHandler("analyze_plugin_trace_logs");
      const connection = {
        get: jest.fn(),
      };

      const result = await handler({ mode: "plugin" }, connection);

      expect(result.error).toBe("ValidationError");
      expect(connection.get).not.toHaveBeenCalled();
    });

    it("returns NotFoundError when assembly cannot be resolved", async () => {
      const handler = getToolHandler("analyze_plugin_trace_logs");
      const connection = {
        get: jest.fn().mockResolvedValue({ value: [] }),
      };

      const result = await handler(
        {
          mode: "assembly",
          assemblyName: "Missing.Assembly",
        },
        connection,
      );

      expect(result.error).toBe("NotFoundError");
    });
  });
});
