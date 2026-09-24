# Unit 11 — ChatGPT Platform (Parser, Normalization, Rendering)

> **Status:** Draft — awaiting approval
> **Fixture status:** Provisional (synthetic). No real ChatGPT export is available; see ADR-A.
> **Depends on:** Import path (Unit 08), platform-adapter contract & normalized model (Units 09/10).
> This spec is implementation-agnostic. Names such as "normalized model" refer to the existing contract; Plan mode must confirm alignment before coding.

---

## 0. Research Basis

ChatGPT's export format is undocumented by OpenAI and changes over time. This spec is based on independent sources, cross-checked against each other:

| Source | Used for |
|---|---|
| xuy/docs-for-agents — `ChatGPT_export_schema.md` (2025; self-reported analysis of 4,200+ real conversations) | Node/message schema, content types, roles, hidden messages, citations, image pointers |
| chatexports.com — conversations.json guide (Apr 2026) | Root node, branch choice, content-type payload locations, nullable times, cycles, detached subtrees |
| saveai.net / ai-chat-importer.com guides (Jul 2026) | Sharded exports (`conversations-000.json` …) |
| hiapi.ai — asset pointer article (Jul 2026) | Image pointers are internal references, not resolvable offline |
| Sample `conversations.json` supplied by the project owner | Minimal shape confirmation only (synthetic) |

Everything marked **[Unverified]** below comes from third-party sources only and must be re-checked against the first real export.

---

## 1. Goal

Import a ChatGPT data export and render each conversation the way it was seen in ChatGPT (the active branch), without ever failing the whole import because of one unexpected structure.

---

## 2. User Flow

1. User selects one ChatGPT export file, or all shard files of one export.
2. App recognizes the platform as ChatGPT and imports.
3. App shows an import summary: conversations imported, conversations skipped (with reason).
4. Conversations appear in the list. Opening one shows the active branch in ChatGPT styling.
5. Content that cannot be shown offline (images, files, unknown types) appears as a clear placeholder, never as a blank gap or an error.

---

## 3. Functional Requirements

### FR-1 Detection
- The existing dispatcher rule stays: every provider's `detect()` runs; exactly one match succeeds; zero matches → unsupported-format error; more than one → ambiguous-format error. So the ChatGPT detector must never match a DeepSeek, Claude, or Gemini file, and none of those may match a ChatGPT file.
- ChatGPT detector: top-level non-empty array; at least one element has a `mapping` object containing a node whose `message` has a string `author.role` and a `content.content_type`; **and no node carries `message.fragments`** (DeepSeek's marker, confirmed in the existing DeepSeek detector). Structure only — never file name or MIME type.
- Unlike DeepSeek's "every element must match" rule, ChatGPT requires only **at least one** matching element, so one damaged conversation cannot make a whole real export undetectable (see FR-3). Damaged elements are skipped and reported at parse time (ADR-F).
- A file that matches no platform yields the existing unsupported-format error, not a crash.

### FR-2 Multiple files
- Exports may be split into numbered shard files with identical inner structure. The existing multi-file import already handles this: each shard is detected and parsed as its own file, and the batch is confirmed once. No new import-UI work is needed.
- A non-conversation JSON file selected alongside shards (e.g. a manifest) fails on its own with the existing unsupported-format error and does not block the other files.
- Same conversation id appearing twice: follow the existing duplicate-import behavior.

### FR-3 Conversation isolation
- Each conversation is parsed independently.
- Only entries that are not usable conversations are **skipped**: non-object entries, no usable `mapping`, or no usable id. Each skip is recorded with a reason in the parsed data (user-facing reporting is a known gap, deferred to 11b; ADR-J).
- Broken structure inside a usable conversation (cycle, missing parent, detached subtree, no `current_node`) is **not** a skip: it is handled by the FR-4 fallbacks and the conversation imports.
- If every entry of a file is skipped, the file fails with the existing loud error instead of importing as empty.
- Unknown fields are ignored. Missing optional fields never throw.

### FR-4 Active branch
- The displayed thread is the path from `current_node` back to the root, in chronological order.
- Fallbacks, in order, when `current_node` is missing, unknown, or the path is broken:
  1. From the root, follow the **last** child at each fork (most recent branch).
  2. All nodes with a valid message, ordered by time.
- A `parent` that points to a missing node counts as a root. Cycles must terminate.
- Alternative (regenerated/edited) branches are not imported in v1.

### FR-5 Visibility
The following are **never displayed**:
- `system` role messages
- Messages with `weight` 0 or `metadata.is_visually_hidden_from_conversation` true
- Empty messages (no text, no placeholder-worthy part)
- `user_editable_context` and `model_editable_context` (custom instructions and memory — private and not part of the visible chat)
- Nodes with no message (root anchor)

FR-5 is enforced in two places by design: the parser drops the four non-displayed kinds (system, hidden, weight 0, editable context) from the thread but still lets their times feed FR-9 inheritance, and normalization applies the same rule again as a safety net. A conversation that is empty after filtering stays storable and listed (empty message list).

### FR-6 Content mapping

| Source | Normalized as |
|---|---|
| `text`, `multimodal_text` (string parts), user or assistant, addressed to the user | Message text |
| `code`, `execution_output`, `computer_output` | Tool activity |
| `tool` role, assistant messages addressed to a tool (`recipient` ≠ `all`), `tether_browsing_display`, `tether_quote` | Tool activity |
| `thoughts`, `reasoning_recap`; assistant `channel` = commentary **[Unverified]** | Assistant text, kept distinguishable by `sourceFragmentType` (ADR-G) |
| `image_asset_pointer` part | Attachment message (existing `attachment` kind) |
| Any other object part, `super_widget`, or unknown `content_type` | Message with no text; raw content kept in `sourceFragment`; renderer shows a placeholder naming the type |

**Normalization rules** (copied from existing DeepSeek/Claude conventions; nothing is dropped except what FR-5 hides):
- **Role:** `user` → `user`; `assistant` and `tool` → `assistant` (tool activity is always assistant-side, as in DeepSeek); any other stated role → `unknown`. Never guessed.
- **Reasoning:** `thoughts` / `reasoning_recap` → kind `text`, role `assistant`, `sourceFragmentType` = the original `content_type`. This mirrors DeepSeek's `THINK`. Presentation is decided in 11b.
- **Tool activity:** `activityType` = original `content_type`; tool name (author name or `recipient`) → `toolName`; code text → `toolInput`; output text → `toolOutput`. Other tool fields stay absent.
- **Attachments:** `fileId` = asset pointer (or attachment id); `fileName` = attachment name if present, otherwise one fixed placeholder label; `fileSize` only when present. Role = role of the message that contains them.
- **One payload per message** (as existing): a `multimodal_text` message with text and an image becomes a text message followed by an attachment message, in source order.
- **Unknown types** never throw; `sourceFragmentType` always holds the verbatim source type. For text taken from a `multimodal_text` message that is `multimodal_text`; for an image part it is the part type (`image_asset_pointer`).

Text extraction checks, in order: string parts → `text` → `result` → `thoughts` → `content` (string, e.g. `reasoning_recap` **[Unverified]**) → placeholder. It never assumes `parts[0]`.

### FR-7 Text cleanup
- Citation markers wrapped in the private-use delimiters U+E200…U+E201 (e.g. `cite`/`filecite` forms) and the 【…】 bracket form are removed from displayed text. They are not converted to references in v1 (source content is normally absent from the export).
- Other marker kinds inside those delimiters (e.g. entity markers) are also removed; this may drop a visible name **[Unverified — known limitation]**.
- Persian/RTL text, ZWNJ, and mixed-direction content pass through unchanged.

### FR-8 Media and attachments
- Image pointers (`sediment://…`, `file-service://…`) are internal and not resolvable offline. Each shows a placeholder; dimensions may be shown when present.
- Attachment metadata, when present with a file name, shows the name as a non-interactive attachment placeholder. If the shape is unrecognized, it is ignored silently.

### FR-9 Metadata
- Title: missing/empty → existing fallback convention.
- Times are Unix **seconds** (fractional). Normalization converts each once to an ISO-8601 UTC string, because the shared presentation layer reads times with `Date.parse` (ADR-I). Non-finite or out-of-range values are omitted, never thrown on. Message time missing → the nearest ancestor on the resolved thread that carries a time (hidden ancestors count) → conversation `create_time` → none. Missing time never breaks ordering or display.
- Model: per-message `metadata.model_slug` only, carried on that message's `model` as the raw slug. `default_model_slug` is not used: the shared model has no conversation-level model and models are never aggregated (ADR #15).
- Ids are opaque strings; no UUID format is assumed. Conversation id comes from `id`, falling back to `conversation_id`; if neither is usable the conversation is skipped (never fabricated).
- A missing title stays absent; no title is derived, and no other provider's code is imported.

### FR-10 Rendering
- Reuse the existing message, tool-activity (single toggle), attachment, long-message collapse, RTL/LTR direction and sanitized-Markdown behavior from earlier units. No changes to the shared model (`UnifiedConversation`, `UnifiedMessage`) and no new dependencies.
- ChatGPT visual identity (dark theme, user bubble, assistant text without bubble, action-icon row) follows the supplied screenshots and is defined in `ui-context.md` before Unit 11b starts.
- Math markup (`\( \)`, `$$`) displays as plain text in v1.

---

## 4. Non-Functional Requirements

- Fully offline; no network calls; no new dependencies without approval.
- Reuse the existing import pipeline unchanged: whole-file read and parse inside the per-file worker, the existing 50 MB confirmation banner, no hard size limit. Real exports can exceed 200 MB **[Unverified]**, which may exhaust worker memory; then the existing unexpected-import error must appear and the page must stay responsive. A streaming parser is out of scope for v1 (ADR-H); smaller shard files are the expected workaround.
- Parsing is deterministic: same input → same output.
- Nothing from the export is written to git; fixtures are synthetic only.

---

## 5. Validation

| Input problem | Result |
|---|---|
| Not valid JSON | Single clear error |
| Valid JSON, not a recognized platform | Single clear error |
| Array with some non-object entries | Entries skipped, counted |
| Conversation without usable `mapping` | Skipped, counted, reason listed |
| Message without `content` or `author` | Message skipped, conversation continues |

---

## 6. Edge Cases

| Scenario | Expected behavior |
|---|---|
| Root is a real message (as in the supplied sample) | Parsed normally |
| Root is `message: null` | Skipped, thread starts at its child |
| `current_node` missing or unknown | Fallback per FR-4 |
| Cyclic parent chain | Terminates; partial thread shown |
| Detached subtree / empty main thread | Time-ordered fallback |
| `create_time` null | Fallback per FR-9 |
| `parts` contains mixed strings and objects | Text in order, objects as placeholders |
| Assistant message that is only a tool call | Shown as tool activity, not as empty text |
| Whole conversation hidden/empty after filtering | Listed with an empty-state, not dropped silently |
| Persian text with ZWNJ | Preserved exactly |
| Very long single message | Existing collapse behavior |
| Very large file (100 MB+) | Existing large-file banner; then imports, or fails with the existing error; never freezes the page |

---

## 7. Fixtures (all synthetic, labeled as such)

1. `minimal` — the supplied sample, unchanged.
2. `structure` — null root, hidden system node, weight 0 node, null times, missing `current_node`.
3. `branching` — regenerated and edited branches; active path differs from first-child path.
4. `content-types` — `multimodal_text` with image pointer, `code`, `execution_output`, `thoughts`, `reasoning_recap`, `tether_browsing_display`, context types, unknown type.
5. `citations` — private-use and bracket citation markers.
6. `persian` — RTL, ZWNJ, mixed English/Persian, code blocks.
7. `hostile` — in order: a valid conversation; a conversation with no `mapping` (skipped with a reason); a conversation with a cycle and a missing parent (imported via the FR-4 fallback); a valid conversation.
8. `shards` — two files forming one export, plus a non-conversation JSON file.

**Fixtures README:** the ChatGPT fixtures folder gets a `README.md` with the same structure as the existing Claude and Gemini fixture READMEs (Plan mode must read those two first and mirror them). It must state that every committed file is synthetic and why, where each one came from (research sources / the owner-supplied sample generated by ChatGPT), and that ChatGPT is Unverified. It must also reserve a gitignored location, with instructions, for the future real export (personal content, never committed), and add the matching ignore rule.

**Verification gate:** ChatGPT stays **Unverified** in docs until a real export is run through the same suite. Swapping in the real file must not require parser changes for anything in this spec; any difference found is logged as a new ADR.

---

## 8. Delivery Slicing (per workflow rules: one boundary at a time)

| Sub-unit | Scope |
|---|---|
| 11a | Provider module (detect + parse), normalization, registry entry, fixtures + fixtures README, tests, ADR-log and progress-tracker entries, and the two minimal shell edits forced by the new `ProviderId` value. ChatGPT stays `available: false` in the picker |
| 11b | ChatGPT theme and renderer mapping (after `ui-context.md` update), then enable ChatGPT in the picker |
| 11c | `README.md` and `docs/parsers.md` |

### Integration points (from code inspection)

| Area | Location |
|---|---|
| Provider id type | `src/types/providers.ts` (`ProviderId`) |
| New provider module | `src/parsers/chatgpt/{index,detect,parse,types}.ts` (same shape as the other three) |
| Normalization | `src/normalization/chatgpt.ts`, wired in `normalizeConversations.ts` |
| Registry | `src/detection/registry.ts` (`PROVIDER_MODULES`) |
| Picker | `src/components/import/platformOptions.ts` (`available` flag, flipped in 11b) |
| Forced by the new id | `src/components/library/platformLabels.ts` (label entry) and `src/components/shell/ConversationStage.tsx` (one placeholder case, replaced in 11b) |
| Shared model | `src/types/conversation.ts` — **not modified** |

---

## 9. Acceptance Criteria

> **Acceptance level:** in 11a, AC 1, 2, and 8 are verified at pipeline level (detect → parse → normalize → library import), because ChatGPT stays unavailable in the picker until 11b. The UI run happens in 11b.

1. Importing `minimal` (the supplied sample, unchanged) yields 1 conversation with 3 messages in order (user, assistant, user), Persian text intact.
2. Importing `structure` shows no system, hidden, weight-0, or context messages; no error is raised.
3. In `branching`, the displayed thread equals the `current_node` path; with `current_node` removed, it equals the last-child path.
4. In `content-types`, every displayed content type appears as its FR-6 category; the unknown type shows a placeholder naming it; `thoughts` and `reasoning_recap` are normalized as assistant text with their original type in `sourceFragmentType`.
5. Image parts appear as placeholders; no broken-image icon or empty gap appears.
6. In `citations`, no marker characters or bracket markers remain in displayed text.
7. In `hostile`, three conversations import (both valid ones and the cycle one, via fallback); the one with no `mapping` is skipped with a recorded reason; nothing hangs or throws.
8. In `shards`, selecting both shard files and the extra JSON file together imports both shards; the extra file fails alone with the existing unsupported-format error.
9. Detection is exclusive in both directions: every ChatGPT fixture is detected only as ChatGPT, and the existing DeepSeek, Claude, and Gemini fixtures are still detected only as their own platform (no ambiguous-format error).
10. A conversation with null times displays and sorts without error.
11. No new dependencies in `package.json`; build, lint, and all tests pass.
12. A generated synthetic file of roughly 100 MB (created by a script, never committed) either imports or fails with the existing error after the existing banner; the page never hangs.
13. The ChatGPT fixtures folder contains a README mirroring the Claude/Gemini ones, and the ignore rule for a future real export exists.
14. Docs, `progress-tracker.md`, and ADR log are updated; ChatGPT is documented as **Unverified**.

---

## 10. Out of Scope (v1)

Resolving images/attachments from a zip or folder · reading the zip directly · `chat.html` · alternative branches (the model's existing `alternatives` field could carry them in a later version) · citation source links · math rendering · projects / custom-GPT grouping · showing custom instructions or memory · legacy flat `messages` conversations (skipped and reported).

---

## 11. ADR Candidates (to log after approval)

- **ADR-A** Provisional synthetic fixtures; parser is defensive; ChatGPT marked Unverified until a real export passes the suite.
- **ADR-B** v1 imports the active branch only.
- **ADR-C** Media and attachments are placeholders in v1.
- **ADR-D** Custom instructions, memory, and system messages are never rendered.
- **ADR-E** Citation markers are stripped, not resolved.
- **ADR-F** ChatGPT detection requires at least one matching element plus the absence of DeepSeek's `fragments` marker (deliberately looser than "every element" so a damaged conversation does not block a real export).
- **ADR-G** `thoughts` / `reasoning_recap` are imported as assistant text with the original type kept in `sourceFragmentType`, following DeepSeek's `THINK` precedent. No shared-model change; nothing is dropped. Whether they are shown, collapsed, or hidden is a renderer decision in 11b.
- **ADR-I** First non-verbatim timestamp mapping: Unix seconds → ISO-8601 UTC string in normalization, because ChatGPT is the only provider whose export times are numbers.
- **ADR-J** Skip-and-record for non-conversation entries (deliberate, narrow exception to loud failure); a file where everything is skipped still fails loudly; user-facing reporting deferred.
- **ADR-H** No streaming parser in v1; the existing whole-file worker path is reused, with shard files as the workaround for huge exports.

---

## 12. Open Questions

Resolved by code inspection: DeepSeek is implemented and distinguished by `fragments` (FR-1); large files use a whole-file worker with a 50 MB warning and no limit (NFR); multi-file import already exists (FR-2); DeepSeek folds `THINK` into assistant text with `sourceFragmentType` preserved (ADR-G); attachment, tool-activity, and role conventions are documented in FR-6.

| # | Question | Blocks |
|---|---|---|
| 1 | Plan mode to confirm: date format used by `createdAt` / `updatedAt` in existing normalizers (ISO string?), and how `order` is assigned | FR-9 |
| 2 | Plan mode to confirm: how the renderer currently presents `THINK` (from `sourceFragmentType`), so 11b can reuse it for `thoughts` | 11b |
| 3 | Real export behavior on 100 MB+ files (memory exhaustion in the worker). Cannot be answered until a real export exists. | ADR-H |
