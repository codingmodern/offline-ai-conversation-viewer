# Claude Real Export Fixture (local-only)

## Location

The real Claude export lives **outside the repository**, on the user's desktop:

```
C:\Users\<username>\Desktop\data\claude\conversations.json
```

## Why it is not committed

- The file is a genuine personal export (~9.9 MB) containing private conversation
  content. Committing it would leak personal data into the repository history
  (Unit 09 spec §5 privacy note; ai-workflow-rules).
- Everything under `context/fixtures/claude/` except this README is git-ignored
  (see the `context/fixtures/claude/*` block in the repository root `.gitignore`).

## How it is used

- **Acceptance only.** The census/detection work and the manual
  import → library → theme acceptance run point at this path directly; the file
  is read in place and never copied into the repository.
- **Committed tests never read it.** The vitest suite uses synthetic fixtures
  (`tests/fixtures/claudeExport.ts` and friends) whose shape is derived from the
  census of this file, so the committed suite is reproducible on any machine.

## Census summary (Unit 09 detection basis)

Derived from a one-off counting script run against the real file (results
recorded in `context/feature-specs/09-claude-platform-parser-renderer.md` and the
ADR log): conversation-level keys, `chat_messages` presence, fragment type
distribution, `thinking` variants (`thinking_hidden`, `summaries`),
`tool_use`/`tool_result` linkage, attachment keys (`extracted_content`),
branching (last-child walk), and `summary` presence.

Do **not** regenerate fixtures from memory of a different export — rerun the
census against this file if the format questions reopen (ai-workflow-rules §3).
