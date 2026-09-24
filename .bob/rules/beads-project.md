# Beads Integration Rules

This project uses bd (beads) for issue tracking.

## When to Use Beads

Use Beads for:
- Complex, multi-step tasks with dependencies
- Long-horizon projects that span multiple sessions
- Tasks that need persistent memory and context
- Collaborative work that requires coordination

Use regular todo list for:
- Simple, linear tasks
- Quick fixes or one-off changes
- Tasks that can be completed in a single session

## Workflow

### Starting Work

1. Check available tasks: Use the beads MCP tool to list ready tasks
2. Claim a task: Update task status to in_progress and assign to yourself
3. Load context: Get workflow context and persistent memories
4. Review dependencies: Check parent/child tasks and blockers

### During Work

1. Create subtasks as needed for complex work
2. Link dependencies between tasks
3. Store important insights as memories
4. Update task status and progress notes

### Completing Work

1. Update task status to completed
2. Store lessons learned as memories
3. Unblock dependent tasks
4. Create follow-up tasks if needed

## Beads Commands Reference

Available through MCP server:

- `list_ready_tasks`: Show tasks with no open blockers
- `create_task`: Create a new task
- `update_task`: Update task status, assignee, or details
- `add_dependency`: Link tasks (parent-child, blocks, related)
- `show_task`: View task details and history
- `get_context`: Get workflow context and memories
- `store_memory`: Save project insights

## Best Practices

1. **Task Granularity**: Break large tasks into subtasks of 1-4 hours each
2. **Dependencies**: Always link related tasks to maintain context
3. **Memory Storage**: Store insights immediately when discovered
4. **Status Updates**: Keep task status current for accurate workflow
5. **Context Loading**: Always load context before starting a task

## Example Workflow

### Feature Development

```
Epic: Add user authentication
├── Task: Design authentication flow
│   └── Subtask: Create user stories
│   └── Subtask: Design API endpoints
├── Task: Implement backend
│   └── Subtask: Set up database schema
│   └── Subtask: Create auth middleware
│   └── Subtask: Write tests
└── Task: Implement frontend
    └── Subtask: Create login form
    └── Subtask: Add session management
    └── Subtask: Write integration tests
```

### Bug Fixing

```
Bug: Login fails on mobile
├── Task: Reproduce issue
├── Task: Investigate root cause
├── Task: Implement fix
└── Task: Add regression tests
```

## Integration with Bob's Todo System

- Use Beads for the overall project structure and long-term planning
- Use Bob's todo list for immediate, session-specific tasks
- Sync completed todos back to Beads tasks when appropriate
- Reference Beads task IDs in todo items for traceability

## Troubleshooting

### MCP Server Not Responding

1. Check that `beads-mcp` is installed: `pipx list`
2. Verify MCP configuration in `.bob/mcp.json`
3. Restart Bob or VS Code
4. Check Bob's MCP logs for errors

### Tasks Not Showing

1. Verify project is initialized: `bd init --stealth`
2. Check `.beads/` directory exists
3. Run `bd ready` manually to test CLI
4. Verify database is not corrupted

### Permission Issues

1. Ensure `bd` is on your PATH: `which bd`
2. Check file permissions on `.beads/` directory
3. Verify user has write access to project directory

