## Summary

- What changed:
- Why it changed:
- Related issue(s):

## Change Type

- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] docs
- [ ] test
- [ ] chore

## PR Validation Checklist (Required)

### Scope & Intent

- [ ] PR solves a real D365 developer pain point
- [ ] Scope is minimal and focused (no unrelated changes)
- [ ] Public behavior changes are clearly described

### Safety & Security

- [ ] No secrets, tokens, or credentials are committed
- [ ] Logs do not expose sensitive values
- [ ] Inputs are validated/sanitized before use
- [ ] Tool inputs are validated with `zod` schemas (or justification provided)
- [ ] Destructive operations require explicit confirmation paths

### MCP Tool Quality

- [ ] Tool names/descriptions are clear and task-specific
- [ ] Tool parameters are typed, validated (`zod`), and documented
- [ ] Tool responses are validated (`zod`) and remain contract-stable
- [ ] Tool outputs are structured and actionable
- [ ] Error responses include actionable suggestions

### D365/Dataverse Correctness

- [ ] Logical names and SDK message names are validated
- [ ] OData filters/paths are safely constructed
- [ ] Queries select only needed columns
- [ ] Step/order/stage logic is correct for plugin workflows

### Tests & Verification

- [ ] Unit tests added/updated for changed logic
- [ ] Validation tests cover schema failures and type mismatches
- [ ] Edge cases and failure paths are covered
- [ ] Integration tests that create Dataverse records include deterministic cleanup
- [ ] `npm test` passes locally
- [ ] `npm run build` passes locally

### Documentation

- [ ] README/CONTRIBUTING updated if behavior or workflow changed
- [ ] Examples updated if tool usage changed
- [ ] Breaking changes are explicitly called out

## Test Evidence

- `npm test` output summary:
- `npm run build` output summary:

## Reviewer Notes

- Risks:
- Follow-up items:
