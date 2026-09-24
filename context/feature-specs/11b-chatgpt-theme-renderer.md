# Unit 11b — ChatGPT Theme, Renderer, and Picker Activation

> **Status:** Draft v2 — updated after code investigation; awaiting approval
> **Depends on:** Unit 11a (provider, normalization, fixtures — committed).
> **Fixture status:** Still Provisional/Unverified (ADR-A). Real-export verification is not part of this unit.
> File names follow the existing theme pattern; Plan mode confirms them.

---

## 1. Goal

Show imported ChatGPT conversations in a ChatGPT-styled view and make ChatGPT selectable in the import flow, so the full UI path (pick → import → library → read) works end to end.

---

## 2. User Flow

1. User opens the import flow; ChatGPT is selectable (no "coming soon").
2. User picks ChatGPT and selects a ChatGPT file. A file from another platform is blocked by the existing mismatch guard.
3. Import completes; the conversation appears in the library labeled "ChatGPT".
4. Opening it shows a ChatGPT-styled thread: date line, user bubbles, plain assistant text, grouped reasoning/tool activity, attachment and unsupported-content placeholders.

---

## 3. Functional Requirements

### FR-1 Sources of truth for visuals
- `ui-context.md` §4.3 is the baseline. The owner's real ChatGPT screenshots amend it for **structural facts**, following the ADR #17 precedent (DeepSeek's blue tint was removed once real screenshots disproved the doc).
- Amendments to §4.3, made **before any theme code** (sub-unit 11b-0): no assistant avatar; a centered muted date line above the thread; a token for inline-code chips; decorative icons (like, regenerate, share, more, edit) dropped.
- **User bubble color is an exception (decided by the owner):** the blue in the screenshots is a personal accent setting, not the product default. §4.3's neutral dark token stays; no blue token is added.
- No color, size, or token is invented beyond §4.3 plus these amendments.

### FR-2 Theme dispatch
- The conversation stage renders ChatGPT records with the new theme, replacing the 11a placeholder case, using the same "loading until resolved, then view" pattern as the other three themes.
- The other three themes are unchanged.

### FR-3 Messages
- User messages: right-aligned bubble per §4.3 tokens.
- Assistant messages: plain full-width text, no bubble, **no avatar**.
- Reused **by copy-and-restyle, never by import** (themes never import across theme folders): sanitized Markdown, code fences, RTL/LTR direction, long-message collapse.
- Math markup displays as plain text.

### FR-4 Reasoning and activity
- A contiguous run of reasoning messages (the `sourceFragmentType` values 11a emits for `thoughts` / `reasoning_recap` / commentary) and `tool_activity` messages renders as **one collapsed group with a single toggle**, as in the Claude theme. Reasoning inside the group uses the embedded thinking style.
- No fabricated durations. Recap text (e.g. a duration) is shown only if present in the data.

### FR-5 Tool rows
- Each row shows `toolName`, input, and output when present, and only what exists.
- ChatGPT data has no tool-use id, so Claude's id-pairing logic is **not** copied; rows are unpaired.

### FR-6 Attachments and unsupported content
- Attachment messages use a copied attachment chip; the 11a placeholder name displays as-is; no size when absent.
- A message with no text and an unrecognized `sourceFragmentType` shows a placeholder naming that type, never a blank.

### FR-7 Date and metadata
- A centered muted date line appears once above the thread: conversation `createdAt`, else the first message time, else nothing. It uses the existing `fa-IR` formatting approach.
- Assistant action row shows the message date only, the way the Claude theme does. The model slug is not displayed (no theme renders it; ADR #15).

### FR-8 Actions
- Copy is the only action: on user bubbles, assistant messages, and code blocks (copy-and-restyle of the existing copy button, same behavior and feedback).
- Per §4.3 it is revealed on hover for pointer devices; it stays reachable by keyboard focus and on touch.

### FR-9 Code
- Fenced code blocks follow §4.3 (permanently dark, language label, copy).
- Inline code uses the new inline-code token.

### FR-10 Picker activation
- ChatGPT's `available` flag becomes true, only after FR-2 to FR-9 are done and tested.
- Existing tests that assert ChatGPT is "coming soon" (the four-platform badge count and the pending-platform notice test in `ImportPage.test.tsx`) are updated for ChatGPT only, and the stale "future ChatGPT module" comment is corrected.
- A ChatGPT case is added to the stage dispatch tests (none exists today).

---

## 4. Non-Functional Requirements

- Fully offline; no new dependencies; no changes to `src/types/conversation.ts`, parsers, or normalization.
- Theme values come from tokens, never hardcoded hex values.
- Light/dark support follows exactly what the other themes do (Plan mode reports which).
- Accessibility per `ui-context.md` §6; responsive per §7.
- Long-conversation rendering performance is preserved.

---

## 5. Validation

- Unknown or missing fields in a normalized ChatGPT message never crash the view.
- Any `sourceFragmentType` not handled above falls back to plain text or the FR-6 placeholder.

---

## 6. Edge Cases

| Scenario | Expected behavior |
|---|---|
| Conversation with an empty message list | Existing empty state, not an error |
| Reasoning message with no text | Group renders with its label, no crash |
| Tool activity with only `activityType` | Row renders with what exists |
| Attachment without size | Chip without size |
| No usable time anywhere | No date line |
| Reasoning/tool run at the very start or end of a thread | Still one grouped toggle |
| Very long or mixed RTL/LTR Persian text | Existing direction handling |
| Unrecognized type with no text | FR-6 placeholder |

---

## 7. Acceptance Criteria

1. In the UI, picking ChatGPT and importing `tests/fixtures/chatgpt/minimal.json` shows 1 conversation, labeled "ChatGPT", with 3 messages (user, assistant, user). *(UI run deferred from 11a AC 1.)*
2. Importing the `structure` fixture through the UI shows no system, hidden, or context messages. *(Deferred 11a AC 2.)*
3. Importing both shard files plus the extra JSON file through the UI imports both shards; the extra file fails alone. *(Deferred 11a AC 8.)*
4. A file from another platform is blocked while ChatGPT is picked, and a ChatGPT file is blocked while another platform is picked.
5. In `content-types`, contiguous reasoning and tool activity appear as one collapsed group with one toggle; the image appears as a chip; the unknown type appears as a named placeholder.
6. Persian text with ZWNJ and mixed RTL/LTR has correct direction in user and assistant messages.
7. No hardcoded hex values in the ChatGPT theme; token tests pass like the other themes'.
8. Nothing under the ChatGPT theme folder imports from another theme folder.
9. The date line appears once above a thread that has a time, and is absent otherwise.
10. Existing Claude, Gemini, and DeepSeek tests pass unchanged; `ImportPage` tests change only for ChatGPT availability.
11. `npm run test`, `npm run lint`, `npm run build` pass; no new dependencies.
12. The owner's visual check against the screenshots is done, with any remaining differences listed.
13. Docs, `progress-tracker.md`, and ADR log are updated; ChatGPT is still documented as **Unverified**.

---

## 8. Delivery Slicing

| Sub-unit | Scope |
|---|---|
| 11b-0 | `ui-context.md` §4.3 amendments (FR-1). Docs only |
| 11b-1 | ChatGPT theme, message renderer, grouping, placeholders, tests. Picker still unavailable |
| 11b-2 | Stage dispatch, picker activation, test updates (FR-10), UI acceptance AC 1 to 4 |
| 11b-3 | `README.md`, `docs/parsers.md`, tracker, ADRs |

---

## 9. Out of Scope

Functional like/share/regenerate/edit actions · image or file resolution · alternative branches · math rendering · real-export verification · id-pairing of tool calls · any change to 11a code except a bug found by the UI acceptance run (logged as its own ADR).

---

## 10. ADR Candidates

- **ADR-K** ChatGPT reasoning and tool activity use Claude's grouped single-toggle pattern (copied), without id-pairing.
- **ADR-L** Decorative ChatGPT action icons are omitted; only Copy is provided.
- **ADR-M** Real screenshots amend §4.3 for structural facts (ADR #17 precedent); personal accent colors are not adopted.

---

## 11. Open Questions

| # | Item | Owner |
|---|---|---|
| Q1 | Do the other themes support both light and dark, and how is the mode chosen? | Plan mode |
| Q2 | Exactly which `sourceFragmentType` values does 11a emit for reasoning (thoughts, reasoning_recap, commentary)? | Plan mode |
| Q3 | Smallest copy of Claude's grouping that works without tool-use ids | Plan mode |
