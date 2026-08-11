<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Agent workflow

- The primary agent is the planner and reviewer. Use GPT-5.6 Sol for the primary session.
- The primary agent owns requirement clarification, repository investigation, implementation planning, scope decisions, final review, full verification, and commits.
- After the plan is settled, delegate application-code and test-code changes to the project custom agent named `implementer`.
- The `implementer` agent must follow the approved plan, make only scoped changes, and run the directly related tests. It must not commit, push, merge, or expand the scope.
- Run only one write-capable implementation agent at a time because all agents share the same working tree.
- After implementation, the primary agent must inspect the diff and run verification appropriate to the risk before proposing or creating a commit.
- If the `implementer` custom agent or GPT-5.6 Luna is unavailable, do not silently substitute another model. Explain the limitation and ask the user how to proceed.
- The primary agent may directly edit agent configuration, planning documents, and other orchestration-only files when configuring this workflow.
