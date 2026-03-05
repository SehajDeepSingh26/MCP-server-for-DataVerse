# Contributing to MCP D365 Developer Toolkit

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/mcp-d365-dev-toolkit.git`
3. Create a feature branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes thoroughly
6. Submit a pull request

## Development Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your D365 credentials
# (Use a development/sandbox environment)

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test
```

## Code Standards

### Documentation Layout

- Put contributor/project documentation in `docs/` (tracked in Git).
- Keep assistant-specific local context in `llm-context/` (gitignored).
- Do not move contributor-facing guidance into `llm-context/`.

### TypeScript Style

- Use TypeScript strict mode
- Provide type annotations for all public APIs
- Avoid `any` types when possible
- Use meaningful variable and function names

### Runtime Validation (Zod)

- Define request argument schemas with `zod` for each tool handler.
- Parse incoming tool args with `safeParse` (or shared parser helpers) before business logic.
- Validate tool responses with `zod` before returning payloads to MCP clients.
- Prefer `.strict()` schemas for production safety unless extensibility is explicitly needed.
- Return standardized validation errors via `D365Error`/`handleError`.
- Add tests for both valid payloads and invalid payload/type mismatch scenarios.

### Code Organization

- Keep tools focused and atomic
- Each tool should do one thing well
- Separate concerns (connection, tools, utilities)
- Write self-documenting code with clear comments

### Error Handling

- Always handle errors gracefully
- Provide meaningful error messages
- Include suggestions for resolution
- Use the `handleError` utility for consistency
- Include field-level validation details when schema validation fails

### Documentation

- Document all public functions and tools
- Include JSDoc comments with examples
- Update README.md for new features
- Add usage examples where appropriate

## Adding a New Tool

1. **Design Phase**
   - Identify the pain point it solves
   - Define clear inputs and outputs
   - Review against existing tools for overlap
   - Document expected behavior

2. **Implementation**

   ```typescript
   // src/tools/category/new-tool.ts
   export const newTool: ToolDefinition = {
     name: "tool_name",
     description: "Clear one-sentence description",
     inputSchema: {
       type: "object",
       properties: {
         // Define parameters
       },
       required: ["param1", "param2"],
     },
     handler: async (args, connection) => {
       try {
         // Parse and validate incoming args (zod)
         // Implementation
         return result;
       } catch (error) {
         return handleError(error);
       }
     },
   };
   ```

3. **Registration**
   - Add to appropriate tool category file
   - Export from the category index
   - Register in main server

4. **Testing**
   - Write unit tests
   - Add schema validation tests for invalid requests
   - Test with AI assistant
   - Verify error handling
   - Test edge cases

5. **Documentation**
   - Add tool to README.md tools list
   - Provide usage examples
   - Document parameters and return values

## Testing Guidelines

### Unit Tests

- Test each tool independently
- Mock D365 connection
- Test happy path and error cases
- Aim for >80% code coverage

### Integration Tests

- Test against real D365 environment
- Use a dedicated test environment
- Prefer read-only integration tests by default
- For write tests, register created records in `DataverseCleanupRegistry` and clean in `afterAll`
- Fail tests if cleanup fails so no residue remains in Dataverse
- Don't commit sensitive credentials
- Use focused debug run for plugin integration: `npm run test:integration:plugins`
- Use VS Code launch profile: **Debug Plugin Integration Tests**

### AI Assistant Tests

- Test tool discovery
- Test parameter extraction
- Test result interpretation
- Test multi-tool workflows

## Pull Request Process

1. **Before Submitting**
   - Ensure all tests pass
   - Run linter and fix issues
   - Update documentation
   - Add yourself to CONTRIBUTORS.md

2. **PR Description**
   - Describe what changed and why
   - Reference related issues
   - Include screenshots/examples if applicable
   - Note any breaking changes

3. **Review Process**
   - Maintainers will review within 3-5 days
   - Address feedback promptly
   - Squash commits before merge
   - Ensure CI passes

## Commit Messages

Follow conventional commits format:

```text
type(scope): brief description

Longer description if needed

Fixes #123
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, no code change
- `refactor`: Code change that neither fixes bug nor adds feature
- `test`: Adding tests
- `chore`: Maintenance tasks

Examples:

```text
feat(metadata): add create_attribute tool
fix(plugins): handle missing plugin images
docs(readme): add installation instructions
```

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the issue, not the person
- Help others learn and grow

## Questions?

- Open a [Discussion](https://github.com/yourusername/mcp-d365-dev-toolkit/discussions)
- Review existing [Issues](https://github.com/yourusername/mcp-d365-dev-toolkit/issues)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
