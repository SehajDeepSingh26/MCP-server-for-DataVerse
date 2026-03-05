# Quick Start Guide

Get up and running with MCP D365 Developer Toolkit in 5 minutes.

## Prerequisites

- **Node.js 18+**: [Download here](https://nodejs.org/)
- **D365/Dataverse Environment**: With administrator access
- **Azure AD App Registration**: For authentication

## Step 1: Azure AD App Setup (5 minutes)

### Create App Registration

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Click **New registration**
   - Name: `MCP D365 Toolkit`
   - Supported account types: Single tenant
   - Redirect URI: Leave blank
3. Click **Register**

### Configure Permissions

1. Go to **API permissions**
2. Click **Add a permission** → Dynamics CRM
3. Select **Delegated permissions** → `user_impersonation`
4. Click **Add permissions**
5. Click **Grant admin consent** (requires admin)

### Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
   - Description: `MCP Toolkit Secret`
   - Expires: 12 months (or custom)
3. Click **Add**
4. **Copy the secret value immediately** (won't be shown again)

### Note Your Details

Copy these values (you'll need them):

- **Application (client) ID**: From app overview page
- **Directory (tenant) ID**: From app overview page
- **Client secret**: From previous step
- **D365 URL**: Your environment URL (e.g., `https://yourorg.crm.dynamics.com`)

## Step 2: Install & Configure (2 minutes)

```bash
# Navigate to project folder
cd mcp-d365-dev-toolkit

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

Edit `.env` with your details:

```bash
D365_URL=https://yourorg.crm.dynamics.com
D365_TENANT_ID=your-tenant-id-here
D365_CLIENT_ID=your-client-id-here
D365_CLIENT_SECRET=your-client-secret-here
```

## Step 3: Build & Test (1 minute)

```bash
# Build the project
npm run build

# Test connection
npm start
```

Expected output:

```text
[INFO] Starting MCP D365 Developer Toolkit server...
[INFO] Connected to D365: https://yourorg.crm.dynamics.com
[INFO] Connected as user ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
[INFO] Registered 8 tools
[INFO] MCP server started successfully
```

If you see errors, check:

- ✅ All environment variables are set correctly
- ✅ Client secret is valid (not expired)
- ✅ App has admin consent granted
- ✅ User has access to D365 environment

## Step 4: Use with Claude Desktop (2 minutes)

### Find Claude Config

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
**Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`

### Add MCP Server

Edit or create `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "d365-toolkit": {
      "command": "node",
      "args": ["C:\\Users\\karacan\\source\\repos\\mcp-d365-dev-toolkit\\dist\\index.js"],
      "env": {
        "D365_URL": "https://yourorg.crm.dynamics.com",
        "D365_CLIENT_ID": "your-client-id",
        "D365_CLIENT_SECRET": "your-client-secret",
        "D365_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

**Important**: Use the **full absolute path** to `dist/index.js`

### Restart Claude Desktop

Close and reopen Claude Desktop completely.

## Step 5: Test It Out

Try these commands in Claude:

### Test 1: List Entities

```text
List all custom entities in my D365 environment
```

Expected: Should see a list of your custom entities

### Test 2: Describe Entity

```text
Describe the account entity
```

Expected: Complete schema with attributes and relationships

### Test 3: Plugin Analysis

```text
What plugins run when an account is created?
```

Expected: List of plugins in execution order with stages

## Troubleshooting

### "Authentication failed"

```bash
# Check credentials are correct
# Verify admin consent was granted
# Check if secret expired
```

### "Cannot connect to D365"

```bash
# Verify D365_URL is correct (no trailing slash)
# Check network connectivity
# Verify environment is accessible
```

### "MCP server not found in Claude"

```bash
# Verify path in claude_desktop_config.json is absolute
# Check dist/index.js exists (run npm run build)
# Restart Claude Desktop completely
```

### "No tools available"

```bash
# Build the project: npm run build
# Check logs for errors: npm start
# Verify all 8 tools registered successfully
```

## What's Working

Currently implemented (Phase 1 - MVP):

✅ **Metadata Tools**

- `describe_entity` - Get entity schema
- `list_entities` - List all entities
- `get_attribute_details` - Get attribute details
- `create_attribute` - Create attributes with validation and `dryRun`
- `update_attribute` - Update mutable attribute metadata with `dryRun`

✅ **Plugin Tools**

- `get_plugin_execution_chain` - Analyze plugin execution
- `list_plugin_assemblies` - List plugin assemblies
- `analyze_plugin_trace_logs` - Scan and analyze plugin exception trace logs

✅ **Quality & Safety**

- Unit test suite for core utilities (`odata`, error handling, logger)
- Unit tests for metadata tools and plugin tools
- Unit and integration tests for D365 connection (`WhoAmI`)
- OData input validation and escaping for query safety
- Sensitive-value redaction in logs

## Next Steps

1. **Try It**: Test all 8 tools with different entities
2. **Validate Quality**: Run `npm test` and `npm run build`
3. **Validate Real Environment**: Run `npm run test:integration`
4. **Debug Plugin Tools in Real Time**:

- Run focused suite: `npm run test:integration:plugins`
- Use VS Code launch profile: `Debug Plugin Integration Tests`
- Set breakpoints in `src/tools/plugins/index.ts` and step through handler logic
- Optional test targeting env vars:
  - `D365_TEST_PLUGIN_ASSEMBLY_NAME` (default: `Microsoft.Crm.ObjectModel`)
  - `D365_TEST_PLUGIN_TYPE_NAME` (default: `Microsoft.Crm.Extensibility.InternalOperationPlugin`)

5. **Write-Test Hygiene**:

- Keep integration tests read-only by default
- If a test writes records, register IDs in `DataverseCleanupRegistry` and clean in `afterAll`
- Fail test runs when cleanup fails to prevent Dataverse residue

6. **Extend It**: Add new tools (see [MCP Development Guidelines](./mcp-development-guidelines.md))
7. **Contribute**: Help build Phase 2 tools (see [CONTRIBUTING.md](../CONTRIBUTING.md))

## Need Help?

- **Documentation**: Check local `docs/` folder
- **Guidelines**: Read [mcp-development-guidelines.md](./mcp-development-guidelines.md)
- **Issues**: Open a GitHub issue

## Security Notes

⚠️ **Never commit `.env` file to source control**  
⚠️ **Use a dedicated service principal, not your personal account**  
⚠️ **Test in DEV/TEST environment first, not PROD**  
⚠️ **Rotate client secrets regularly**

---

**Ready to go!** You now have a working MCP server that brings D365 directly into your AI workflow.
