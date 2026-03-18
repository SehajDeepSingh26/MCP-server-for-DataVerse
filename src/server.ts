import express from "express";
import dotenv from "dotenv";
import { D365Connection } from "./d365/connection.js";
import { registerMetadataTools } from "./tools/metadata/index.js";
import { registerPluginTools } from "./tools/plugins/index.js";
import { registerApiTools } from "./tools/api/importFromApi.js";
// import { registerApiTools } from "./tools/";

dotenv.config();

const app = express();
app.use(express.json());

// Init connection
const connection = new D365Connection({
  url: process.env.D365_URL!,
  clientId: process.env.D365_CLIENT_ID!,
  clientSecret: process.env.D365_CLIENT_SECRET!,
  tenantId: process.env.D365_TENANT_ID!,
});

// Register tools
const tools = new Map<string, any>();

[
  ...registerMetadataTools(),
  ...registerPluginTools(),
  ...registerApiTools(),
].forEach((tool) => tools.set(tool.name, tool));

// Health check
app.get("/", (_req, res) => {
  res.send("MCP D365 Server Running 🚀");
});

// Tool executor endpoint
app.post("/tool", async (req, res) => {
  try {
    const { name, arguments: args } = req.body;

    const tool = tools.get(name);
    if (!tool) 
      return res.status(400).json({ error: "Tool not found" });

    const result = await tool.handler(args, connection);
    return res.status(200).json(result);
  } 
  catch (err: any) {
    return res.status(500).json(
        { error: err.message }
    );
  }
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await connection.connect();
});