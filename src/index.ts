#!/usr/bin/env node

/**
 * MCP Dynamics 365 Developer Toolkit
 *
 * Main entry point for the MCP server.
 * This server provides tools for D365 development operations.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";

import { D365Connection } from "./d365/connection.js";
import { registerMetadataTools } from "./tools/metadata/index.js";
import { registerPluginTools } from "./tools/plugins/index.js";
import { logger } from "./utils/logger.js";

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ["D365_URL", "D365_CLIENT_ID", "D365_CLIENT_SECRET", "D365_TENANT_ID"];
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
  logger.error("Please check your .env file or environment configuration.");
  process.exit(1);
}

/**
 * Main server class
 */
class D365MCPServer {
  private server: Server;
  private d365Connection: D365Connection;
  private tools: Map<string, any> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: "mcp-d365-dev-toolkit",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.d365Connection = new D365Connection({
      url: process.env.D365_URL!,
      clientId: process.env.D365_CLIENT_ID!,
      clientSecret: process.env.D365_CLIENT_SECRET!,
      tenantId: process.env.D365_TENANT_ID!,
    });

    this.setupHandlers();
    this.registerTools();
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()),
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tool = this.tools.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      try {
        logger.info(`Executing tool: ${name}`, args);
        const result = await tool.handler(args, this.d365Connection);
        logger.info(`Tool ${name} completed successfully`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Tool ${name} failed:`, error);
        throw error;
      }
    });
  }

  /**
   * Register all available tools
   */
  private registerTools(): void {
    logger.info("Registering tools...");

    // Register metadata tools (Phase 1)
    const metadataTools = registerMetadataTools();
    metadataTools.forEach((tool) => this.tools.set(tool.name, tool));

    // Register plugin tools (Phase 1)
    const pluginTools = registerPluginTools();
    pluginTools.forEach((tool) => this.tools.set(tool.name, tool));

    logger.info(`Registered ${this.tools.size} tools`);
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    logger.info("Starting MCP D365 Developer Toolkit server...");

    try {
      // Test D365 connection
      await this.d365Connection.connect();
      logger.info(`Connected to D365: ${process.env.D365_URL}`);

      // Start MCP server with stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      logger.info("MCP server started successfully");
    } catch (error) {
      logger.error("Failed to start server:", error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new D365MCPServer();
server.start().catch((error) => {
  logger.error("Unhandled error:", error);
  process.exit(1);
});
