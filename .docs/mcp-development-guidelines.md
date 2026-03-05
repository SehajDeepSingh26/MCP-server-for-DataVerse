# MCP Development Guidelines for D365 Toolkit

## Overview

Model Context Protocol (MCP) enables AI assistants to interact with external systems through a standardized interface. This document outlines best practices for building the D365 MCP toolkit.

## Core Principles

### 1. **Tools, Not Prompts**

MCP servers expose **tools** (functions) that AI can call, not just additional context.

- Each tool should perform one specific action
- Tools should be composable and atomic
- Return structured data that AI can interpret

### 2. **Stateless by Design**

Each tool invocation should be independent.

- Don't rely on previous calls
- Accept all required parameters explicitly
- Return complete results, not references

### 3. **Error Handling First**

Dynamics 365 operations can fail in many ways.

- Return meaningful error messages
- Include suggestions for resolution
- Handle authentication/connection issues gracefully

### 4. **Security & Authentication**

- Use environment variables for credentials
- Support both OAuth and connection strings
- Never log sensitive information
- Implement proper token refresh

## Tool Design Patterns

### Good Tool Design

```json
{
  "name": "get_plugin_execution_chain",
  "description": "Retrieves the complete plugin execution chain for a specific entity and message",
  "parameters": {
    "entity_logical_name": "string (required)",
    "message_name": "string (required)",
    "stage": "string (optional: PreValidation, PreOperation, PostOperation)"
  },
  "returns": {
    "plugins": [
      {
        "name": "string",
        "stage": "number",
        "execution_order": "number",
        "mode": "Synchronous|Asynchronous",
        "images": []
      }
    ]
  }
}
```

### Bad Tool Design

```json
{
  "name": "do_plugin_stuff",
  "description": "Does plugin operations",
  "parameters": {
    "action": "string"
  }
}
```

**Why it's bad**:

- Vague description
- Single parameter that switches behavior
- Unclear what it returns
- Not atomic

## Tool Categories

### 1. **Query Tools** (Read-Only)

Return information without modifying state.

- `get_plugin_execution_chain`
- `describe_entity`
- `get_attribute_metadata`
- `analyze_dependencies`

**Guidelines**:

- Should be fast (< 5 seconds)
- Cache when appropriate
- Return structured, parseable data

### 2. **Modification Tools** (Write)

Change D365 configuration or data.

- `create_attribute`
- `register_plugin_step`
- `deploy_web_resource`

**Guidelines**:

- Require confirmation for destructive operations
- Validate parameters before execution
- Return success confirmation with details
- Support dry-run mode

### 3. **Analysis Tools** (Compute)

Process and analyze D365 data.

- `find_unused_attributes`
- `detect_automation_conflicts`
- `calculate_effective_permissions`

**Guidelines**:

- May take longer to execute
- Provide progress indicators if possible
- Return actionable insights

## Connection Management

### Configuration

Store connection details in environment variables or config files:

```bash
# Environment Variables
D365_URL="https://org.crm.dynamics.com"
D365_CLIENT_ID="..."
D365_CLIENT_SECRET="..."
D365_TENANT_ID="..."
```

### Connection Pooling

Reuse connections across tool calls within the same session:

- Initialize connection on first tool call
- Keep connection alive during session
- Handle token refresh automatically

## Error Responses

### Standard Error Format

```json
{
  "error": "EntityNotFound",
  "message": "Entity 'custum_widget' not found",
  "suggestion": "Did you mean 'custom_widget'? Use describe_entity to list available entities.",
  "details": {
    "attempted_entity": "custum_widget",
    "similar_entities": ["custom_widget", "custom_gadget"]
  }
}
```

### Error Categories

1. **Authentication Errors**: Token expired, invalid credentials
2. **Not Found Errors**: Entity, attribute, plugin doesn't exist
3. **Permission Errors**: User lacks privilege
4. **Validation Errors**: Invalid parameters
5. **Conflict Errors**: Operation would break dependencies
6. **System Errors**: D365 service unavailable

## Performance Optimization

### 1. **Batch Operations**

When the SDK supports it, batch multiple requests:

```typescript
// Good: Batch request
const attributes = await retrieveMultiple([attr1, attr2, attr3]);

// Bad: Sequential requests
const attr1Data = await retrieve(attr1);
const attr2Data = await retrieve(attr2);
const attr3Data = await retrieve(attr3);
```

### 2. **Selective Column Retrieval**

Only retrieve needed columns:

```typescript
// Good
const entity = await retrieve("account", id, ["name", "accountnumber"]);

// Bad
const entity = await retrieve("account", id); // Retrieves all columns
```

### 3. **Caching Metadata**

Entity and attribute metadata rarely changes:

- Cache entity definitions for session duration
- Invalidate on explicit refresh
- Use ETags when available

## Testing Strategy

### Unit Tests

- Test each tool independently
- Mock D365 SDK calls
- Validate parameter parsing
- Test error conditions

Current project baseline includes unit tests for:

- OData escaping and logical-name/message validation
- Error classification and standardized error responses
- Logger redaction behavior for sensitive fields
- Metadata tools (`create_attribute`, `update_attribute`)
- Plugin tools (`get_plugin_execution_chain`, `list_plugin_assemblies`)
- D365 connection layer (`src/d365/connection.ts`)

### Integration Tests

- Test against real D365 trial environment
- Verify authentication flows
- Test with real-world data volumes
- Validate error handling

Current integration baseline includes:

- Real `.env`-based `WhoAmI` connectivity validation via `D365Connection.connect()`

### AI Assistant Tests

- Test tool discovery (can Claude find the right tool?)
- Test parameter extraction from natural language
- Test result interpretation
- Test multi-tool workflows

## Documentation Requirements

### Tool Documentation

Each tool must have:

1. **Clear description**: What it does in one sentence
2. **Parameter documentation**: Type, required/optional, validation rules
3. **Return value description**: Structure and meaning
4. **Examples**: At least 2 usage examples
5. **Error conditions**: What can go wrong

### Example

```typescript
/**
 * Retrieves the complete plugin execution chain for an entity and message.
 *
 * This tool queries the PluginStep table and returns all registered plugins
 * that will execute for the specified entity and SDK message, ordered by
 * stage and execution order.
 *
 * @param entityLogicalName - The logical name of the entity (e.g., "account")
 * @param messageName - The SDK message name (e.g., "Create", "Update", "Delete")
 * @param stage - Optional filter by stage (PreValidation=10, PreOperation=20, PostOperation=40)
 *
 * @returns Array of plugin steps with execution details
 *
 * @example
 * // Get all plugins for account creation
 * get_plugin_execution_chain("account", "Create")
 *
 * @example
 * // Get only post-operation plugins for contact update
 * get_plugin_execution_chain("contact", "Update", "PostOperation")
 *
 * @throws {EntityNotFoundError} If the specified entity doesn't exist
 * @throws {AuthenticationError} If connection to D365 fails
 */
```

## Development Workflow

### 1. **Design Phase**

- Identify specific pain point
- Design tool interface (name, parameters, returns)
- Document expected behavior
- Review with team

### 2. **Implementation Phase**

- Implement core logic with D365 SDK
- Add error handling
- Write unit tests
- Test with AI assistant

### 3. **Refinement Phase**

- Gather feedback from real usage
- Optimize performance
- Improve error messages
- Add missing edge cases

### 4. **Documentation Phase**

- Update tool documentation
- Add usage examples
- Document limitations
- Create troubleshooting guide

## MCP Server Structure

```text
src/
├── index.ts               # MCP server entry point
├── tools/                 # Tool implementations
│   ├── metadata/
│   │   └── index.ts
│   └── plugins/
│       └── index.ts
├── d365/                  # D365 SDK wrappers
│   └── connection.ts
├── utils/
│   ├── error-handler.ts
│   ├── logger.ts
│   └── odata.ts
└── types/
    └── index.ts

tests/
└── unit/
  └── utils/

.github/
└── pull_request_template.md
```

## Best Practices Checklist

### Before Implementing a Tool

- [ ] Is this solving a real pain point?
- [ ] Can this be done with existing tools?
- [ ] Is the scope atomic enough?
- [ ] Have I defined clear parameters?
- [ ] Have I defined the return structure?

### During Implementation

- [ ] Does it handle authentication errors?
- [ ] Does it validate all parameters?
- [ ] Does it return structured data?
- [ ] Does it include meaningful error messages?
- [ ] Does it work with both SDK and Web API?

### After Implementation

- [ ] Have I written unit tests?
- [ ] Have I tested with AI assistant?
- [ ] Is the documentation complete?
- [ ] Have I added usage examples?
- [ ] Does it perform well with real data?

## Resources

- [MCP Specification](https://modelcontextprotocol.io)
- [Dataverse SDK Documentation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/)
- [Web API Reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview)
- [MCP Handbook](https://www.notion.so/Handbook-Build-Your-Own-MCP-Server-272e527acd9b8005847bdb96a0616a45)
