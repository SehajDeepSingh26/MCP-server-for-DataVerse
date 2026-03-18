import express from "express";
// import { Server } from "@modelcontextprotocol/sdk/server/index.js";

import dotenv from "dotenv";
import { D365Connection } from "./d365/connection.js";
import { registerMetadataTools } from "./tools/metadata/index.js";
import { registerPluginTools } from "./tools/plugins/index.js";
import { registerApiTools } from "./tools/api/importFromApi.js";

dotenv.config();

const app = express();
app.use(express.json());

// const server = new Server(
//   { name: "d365-remote", version: "1.0.0" },
//   { capabilities: { tools: {} } }
// );

const connection = new D365Connection({
  url: process.env.D365_URL!,
  clientId: process.env.D365_CLIENT_ID!,
  clientSecret: process.env.D365_CLIENT_SECRET!,
  tenantId: process.env.D365_TENANT_ID!,
});

const tools = new Map<string, any>();

[
  ...registerMetadataTools(),
  ...registerPluginTools(),
  ...registerApiTools(),
].forEach((tool) => tools.set(tool.name, tool));

/**
 * MCP over HTTP
 */
app.post("/", async (req, res) => {
  const { method, params, id } = req.body;

  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: Array.from(tools.values()),
      },
    });
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params;

    const tool = tools.get(name);
    if (!tool) {
      return res.json({
        jsonrpc: "2.0",
        id,
        error: { message: "Tool not found" },
      });
    }

    const result = await tool.handler(args, connection);

    return res.json({
      jsonrpc: "2.0",
      id,
      result,
    });
  }

  return res.status(400).send("Unknown method");
});

const PORT = process.env.PORT || 3000

app.listen(PORT, async () => {
  console.log("Remote MCP server running 🚀");
  await connection.connect();
});