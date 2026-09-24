# Gemini Real Export Fixture (local-only)

## Location

The real Gemini export lives **outside the repository**, on the user's desktop:

```
C:\Users\<username>\Desktop\data\gemini\conversations.json
```

## Why it is not committed

- The file is a genuine Google Takeout "My Activity" export containing private
  conversation content. Committing it would leak personal data into the
  repository history (Unit 10 spec §2 — attachment/privacy handling; ai-workflow-rules).
- Everything under `context/fixtures/gemini/` except this README is git-ignored
  (see the `context/fixtures/gemini/*` block in the repository root `.gitignore`).

## Format note (important — different from Claude/ChatGPT)

Unlike Claude's native conversation export, this is a **Google Takeout "My
Activity" export** — a flat JSON array where each item is a single activity
turn, not a full conversation object. Conversations must be reconstructed by
grouping items via the conversation ID embedded in `details[0].url`.

## How it is used

- **Acceptance only.** Format-detection work and the manual
  import → library → theme acceptance run point at this path directly; the file
  is read in place and never copied into the repository.
- **Committed tests never read it.** The vitest suite uses synthetic fixtures
  derived from the census of this file, so the committed suite is reproducible
  on any machine.

## Census summary (Unit 10 detection basis)

Derived from analysis of the real file (23 activity items / 7 conversations,
recorded in `context/feature-specs/10-gemini-platform-parser-renderer.md`):
grouping key (`details[0].url`), reverse-chronological ordering requiring
re-sort, user text location (`title`, prefixed `"درخواست: "`), assistant
response location (`safeHtmlItem[].html`, pre-rendered HTML, occasionally
multiple draft entries), attachment references without binary data
(`attachedFiles`, `imageFile`, `subtitles`), and absence of per-message id/
role/model fields.

Do **not** regenerate fixtures from memory of a different export — rerun the
census against this file if the format questions reopen (ai-workflow-rules §3).
