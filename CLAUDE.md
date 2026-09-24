## Application Building Context

Read the following files **in order** before implementing or making any architectural decision:

1. `context/project-overview.md` — Product definition, role, goals, features, scope, deliverables, and ADRs
2. `context/architecture.md` — System structure, stack, boundaries, storage model, invariants, non-functional requirements, and edge cases
3. `context/ui-context.md` — Theme, colors, typography, spacing, components, layout, and accessibility
4. `context/code-standards.md` — Implementation rules, testing standards, documentation, and file organization
5. `context/ai-workflow-rules.md` — Development workflow, agent persona, scoping rules, collaboration mode, and verification
6. `context/progress-tracker.md` — Current phase, build plan, completed work, open questions, and session notes
7. `context/adr-log.md` — تاریخچه‌ی تصمیمات معماری (ADRs)، جدا شده از progress-tracker
8. `context/session-archive.md` — یادداشت‌های جلسات قبلی، جدا شده از progress-tracker

### Rules

1. **Read all eight files in order** before writing or modifying any code.
2. **Update `context/progress-tracker.md`** after every meaningful implementation change.
3. **Update the relevant context file** if implementation changes the architecture, scope, standards, or UI documented in the context.
4. **Check invariants** (in `architecture.md`) before every change — never violate them.
5. **Do not skip steps.** Follow the verification checklist in `ai-workflow-rules.md` before marking any unit complete.
6. **No speculative work.** Implement only what the current spec says. Do not add features, refactor unrelated code, or optimize preemptively.
7. **Never introduce new dependencies, libraries, frameworks, architectural patterns, or major refactors without explicit approval.**
8. **Treat the approved context files as the single source of truth.** If there is any conflict between assumptions, memory, or implementation and the context files, follow the context files and ask before changing them.