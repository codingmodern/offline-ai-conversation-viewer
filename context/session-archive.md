# Session Archive

> Verbatim archive of the session notes formerly kept in `progress-tracker.md` (Section 9).
> Contains Sessions 1-21, including the two 2026-08-26 entries that reuse the
> "Session 6" heading and the "Session 6 Follow-up" entry, preserved as written.
> The most recent note (Session 22 - 2026-10-04) remains in `progress-tracker.md`.

---

> Context needed to resume work in the next session. Updated by the agent at the end of each session.

### Session 1 — 2026-06-26

- **Work Done:** All 6 context files created and populated for the "Offline AI Chat Viewer" project
- **Files Created:** `project-overview.md`, `architecture.md`, `ui-context.md`, `code-standards.md`, `ai-workflow-rules.md`, `progress-tracker.md`, `CLAUDE.md`, `README.md`
- **Decisions Made:**
  - System fonts only (no external font downloads)
  - No TypeScript (plain JS to minimize build complexity)
  - 4 skin colors defined (ChatGPT: green/light, DeepSeek: blue/dark, Claude: orange/light, Gemini: purple/dark)
  - All error paths must show user-friendly messages (no White Screen)
- **Next Session Starts With:** Unit 01 — Scaffold Vite + React + Tailwind project

> Note: the "no TypeScript / Tailwind" decision above was superseded by
> `architecture.md` (React + TypeScript + CSS Modules), which is the source of truth.

### Session 2 — 2026-08-20

- **Work Done:** Unit 01 (Import & Validation) implemented end-to-end
- **Files Created:**
  - Tooling: `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc`, `index.html`
  - `src/types/errors.ts` — `ParseError` / `ParseResult` discriminated union
  - `src/features/import/` — `validateJsonText.ts`, `workerContract.ts`, `workerClient.ts`, `fileTypeGuard.ts`, `errorMessages.ts`, `importFile.ts`, `useImport.ts`
  - `src/workers/jsonValidation.worker.ts` — off-main-thread read + parse (renamed to `importPipeline.worker.ts` in Unit 02)
  - `src/components/import/` — `ImportDropzone`, `ImportFileList`, `LargeFileWarning`, `ImportPage` (+ CSS Modules)
  - `src/App.tsx`, `src/main.tsx`, `src/styles/shell.css`
  - Tests: 5 files / 45 tests + fixtures in `tests/fixtures/generic/`
- **Decisions Made:**
  - Validation logic lives in a pure module (`validateJsonText.ts`) that the worker imports, so the rules are testable without a `Worker` in jsdom
  - One worker request per file with a correlation id → independent, non-blocking per-file results (FR3/NFR4)
  - Large files (>50MB) show a confirmation prompt before parsing (warning, not rejection) per the spec
  - Files are rejected only for type/syntax/emptiness — never for "not looking like a known platform" (that stays in Unit 02)
- **Verification:** `npm run build` ✅ · `npm run test` ✅ 45/45 · `npm run lint` ✅ 0 warnings
- **Next Session Starts With:** Unit 02 — write `02-platform-detection.md`, then implement `detection/`

### Session 3 — 2026-08-21

- **Work Done:** Unit 02 (Platform Auto-Detection) implemented end-to-end
- **Files Created:**
  - `src/types/providers.ts` — `ProviderId` + `ProviderModule` contract (`detect()` now, `parse()` added by Unit 03)
  - `src/detection/registry.ts` — the single provider registry + `findProviderModule()`
  - `src/detection/detectProvider.ts` — pure 0/1/many verdict logic
  - `src/parsers/deepseek/` — `detect.ts` (signature) + `index.ts` (module object)
  - `docs/parsers.md` — how to add a new platform
  - Tests: `tests/detection/detectProvider.test.ts`, `tests/detection/registry.test.ts`, `tests/parsers/deepseek.detect.test.ts`
- **Files Modified:**
  - `src/workers/jsonValidation.worker.ts` → **renamed** `src/workers/importPipeline.worker.ts` (now validates _and_ detects)
  - `src/features/import/workerClient.ts` — `validateFileInWorker()` → `processFileInWorker()`
  - `src/features/import/importFile.ts` — `ValidatedFile` → `DetectedFile` (now carries `providerId`)
  - `src/features/import/useImport.ts` — `validatedFiles` → `detectedFiles`
  - `src/types/errors.ts` — added `UnsupportedFormatError`, `AmbiguousFormatError`
  - `src/features/import/errorMessages.ts` — Persian messages for both new codes
  - `src/components/import/ImportPage.tsx` — renamed state only; **no** platform picker added
  - `context/architecture.md` — recorded the single-registry contract
- **Decisions Made:**
  - Only DeepSeek is registered — the sole platform with a real export. See ADR #1: guessing the other three formats would invent product behaviour
  - Detection runs inside the import worker, reusing the already-parsed JSON (ADR #3, NFR1)
  - Detection is deliberately _not_ a separate UI state: it is invisible inside the existing Import progress (spec → UI Behavior)
  - `detectProvider()` takes the registry as an injectable parameter so ambiguity/ordering can be tested with stubs, never by touching real providers
- **Verification:** `npm run build` ✅ (worker emitted as its own chunk) · `npm run test` ✅ 81/81 · `npm run lint` ✅ 0 warnings
- **Next Session Starts With:** Unit 03 — write `03-modular-parsing.md`, then add `parse()` to the existing provider modules via the same registry

### Session 4 — 2026-08-22

- **Work Done:** Unit 03 (Modular Parsing System) implemented end-to-end for DeepSeek
- **Files Created:**
  - `src/types/conversation.ts` — `UnifiedConversation` / `UnifiedMessage` / `UnifiedRole` (the unified target model)
  - `src/parsers/deepseek/types.ts` — `DeepSeekRawData` (Provider Raw Data, deliberately _not_ the unified model)
  - `src/parsers/deepseek/parse.ts` — validated JSON → Raw Data; iterative graph walk, typed failures only
  - `src/normalization/deepseek.ts` — Raw Data → `UnifiedConversation[]`
  - `src/normalization/normalizeConversations.ts` — `providerId` → normalizer dispatch
  - `src/parsers/parseConversations.ts` — registry lookup → `parse()` → `normalize()`
  - Tests: `tests/parsers/deepseek.parse.test.ts`, `tests/normalization/deepseek.normalize.test.ts`, `tests/parsers/parseConversations.test.ts`
- **Files Modified:**
  - `src/types/providers.ts` — `ProviderModule` gained `parse()`; added `ProviderRawData`
  - `src/detection/registry.ts` — the **same** registry entry now also carries `parse` (no second registry)
  - `src/types/errors.ts` — added `MissingFieldError`, `UnexpectedTypeError`
  - `src/features/import/errorMessages.ts` — Persian messages for both new codes
  - `src/workers/importPipeline.worker.ts` — parsing chained after detection in the same run
  - `src/features/import/workerContract.ts` / `workerClient.ts` / `importFile.ts` — `DetectedFile` → `ParsedFile` (carries `conversations`)
  - `src/features/import/useImport.ts`, `src/components/import/ImportPage.tsx` — hand off parsed conversations; still no new UI state
  - `docs/parsers.md` — documents the `parse()`/`normalize()` contracts
- **Decisions Made:**
  - **DeepSeek only.** The spec's "every registered provider" is the scope boundary, and the registry has exactly one entry — see ADR #5. No stub parsers were created for ChatGPT/Claude/Gemini
  - Message order comes from the `mapping` graph, never timestamps (ADR #4) — the fixture proves timestamps are inverted
  - `parse()` derives entry points from graph topology instead of requiring a literal `root` key, so anything `detect()` accepts is guaranteed to parse (Invariant #2); a dedicated test asserts this seam
  - The graph walk is iterative and cycle-guarded, so a malformed export cannot hang or overflow the stack
  - Unknown fragment types normalize to `'unknown'` rather than failing (ADR #6)
  - Nothing is persisted: `UnifiedConversation[]` is handed back in memory, leaving the first IndexedDB write to Unit 04
- **Verification:** `npm run build` ✅ · `npm run test` ✅ 134/134 (11 files) · `npm run lint` ✅ 0 warnings
- **Next Session Starts With:** Unit 04 — write `04-local-chat-library.md`, then persist `ParsedFile.conversations` via Dexie

### Session 5 — 2026-08-23

- **Work Done:** Fixed a real import-blocking bug in Unit 03 and widened the unified
  model to match what DeepSeek exports actually contain
- **Trigger:** a real DeepSeek export (dated 2026-08-20) failed to import with
  `MissingFieldError`. A full census of its fragments found **8** types, not the 3
  in `sample-real.json`: TEXT-bearing (`REQUEST`, `RESPONSE`, `THINK`), ATTACHMENT
  (`FILE`, with `files` and no `content`) and TOOL_ACTIVITY (`SEARCH`,
  `TOOL_SEARCH`, `TOOL_OPEN`, `TOOL_FIND`, with `results` or no payload at all).
  `parse()` required `content` on every fragment, so five of the eight types could
  never import
- **Files Created:**
  - `tests/fixtures/deepseek/sample-rich.json` — anonymized fixture covering all 8
    types (placeholder file names/ids only, no real user data)
  - `tests/normalization/deepseek.fixture.test.ts` — end-to-end `parse()` →
    `normalizeDeepSeek()` over both fixtures, plus a regression suite built from the
    anonymized shapes of the export that failed
- **Files Modified:**
  - `src/types/conversation.ts` — `UnifiedMessage` gained `kind`
    (`text`/`attachment`/`tool_activity`), `attachments`, `toolActivity` and
    `sourceFragmentType`; added `UnifiedAttachment` / `UnifiedToolActivity` /
    `UnifiedMessageKind` (ADR #7)
  - `src/parsers/deepseek/types.ts` — raw fragments now carry a structural
    `category` and a `turnIndex`, plus `files` / `results`
  - `src/parsers/deepseek/parse.ts` — type guards branch by payload category, so a
    critical field is required only where that category defines one
  - `src/normalization/deepseek.ts` — the kind/role/payload mapping table
  - `tests/parsers/deepseek.parse.test.ts`,
    `tests/normalization/deepseek.normalize.test.ts`,
    `tests/features/import/importFile.test.ts` — extended for the new schema
  - `context/architecture.md`, `docs/parsers.md` — the fragment-category contract and
    edge case
- **Decisions Made:**
  - Critical fields are **per category**, never global — see ADR #7. `content` is
    required only for `kind === 'text'`, `files` only for `kind === 'attachment'`,
    and `results` is never required
  - `THINK` is assistant _text_, not a third role; reasoning is told apart from a
    final answer via `sourceFragmentType`
  - `FILE` inherits its role from the turn it arrived with (falling back to the
    closest preceding turn that states one), because an attachment names no sender
  - `results` is passed through **unmodified**: with only one export attesting it, any
    reshaping would be an invented format (`ai-workflow-rules.md` §3)
  - `parse()` still performs _structural_ validation only — the category decides which
    field must exist, and no content is interpreted there (FR1 boundary intact)
  - **Open Question #3 closed (ADR #8):** `UnifiedConversation.updatedAt` is the
    export's own conversation-level `updated_at`, verbatim — never recomputed from
    the newest message. The code already behaved this way incidentally; the change
    makes it an intended, tested decision rather than an accident. `sample-real.json`
    proves the two differ (`updated_at` 23:25:55.182 vs. newest message 23:25:52.537),
    so tests now assert the exported value wins, that it survives even when it
    _predates_ the newest message, and that an absent `updated_at` stays absent
    instead of being derived
- **Verification:** `npm run build` ✅ · `npm run test` ✅ 183/183 (12 files) ·
  `npm run lint` ✅ 0 warnings. The previously failing real export now imports, with
  its `FILE` / `SEARCH` / `TOOL_*` fragments preserved rather than rejected
- **Next Session Starts With:** Unit 04 (unchanged) — write
  `04-local-chat-library.md`, then persist `ParsedFile.conversations` via Dexie.
  Note for Unit 06: `sourceFragmentType` is the hook for rendering reasoning,
  attachments and tool steps distinctly

### Session 6 — 2026-08-24

- **Work Done:** Unit 04 (Local Chat Library) implemented end-to-end — the first
  code in the project that persists anything
- **Files Created:**
  - `src/types/storage.ts` — `StoredConversation` (the row), `LibraryEntry` (the
    Sidebar projection), `StorageError` / `StorageResult`
  - `src/storage/db.ts` — the Dexie subclass and the **only** file that names
    IndexedDB (FR3)
  - `src/storage/duplicateKey.ts` — the (provider, sourceConversationId) rule,
    isolated so ADR #9 can be replaced without touching a component (FR8)
  - `src/storage/validateConversation.ts` — rejects a malformed record before it
    reaches the database
  - `src/storage/quota.ts` — `navigator.storage.estimate()` wrapper, 90% threshold
  - `src/storage/conversationStore.ts` — the whole public API: `saveConversation`,
    `listConversations`, `getConversation`, `deleteConversation`,
    `countConversations`, `subscribeToLibrary`, `findDuplicate`
  - `src/features/library/` — `selectAfterDelete.ts` (pure ADR #10 rule),
    `errorMessages.ts` (Persian text), `importToLibrary.ts` (Unit 03 → storage
    bridge), `useLibrary.ts` (all library state)
  - `src/components/common/ConfirmDialog.tsx` — one accessible modal shared by the
    delete and duplicate flows
  - `src/components/library/` — `Sidebar`, `ConversationListItem`,
    `DeleteConversationDialog`, `DuplicateImportDialog`, `LibraryEmptyState`,
    `StorageQuotaWarning`, `ActiveConversationPlaceholder` (+ CSS Modules)
  - `src/components/shell/AppShell.tsx` — sidebar + main layout
  - Tests: 9 files / 83 new tests (`tests/storage/*`, `tests/features/*`,
    `tests/components/*`) + `tests/fixtures/conversations.ts`
- **Files Modified:**
  - `src/App.tsx` — renders `AppShell` instead of `ImportPage` directly
  - `src/components/import/ImportPage.tsx` — accepts `onConversationsParsed` and an
    optional `onCancel`, so import is reachable from inside the shell
  - `src/features/import/useImport.ts` — hands parsed conversations to the library
    once per completed file, without persisting anything itself
  - `package.json` — added `dexie`; `fake-indexeddb` as a dev dependency
  - `context/architecture.md` — §3 gained the concrete Dexie schema and the
    FR2/FR3 layering rules; §5 Scalability now records the deferred virtualization
    (NFR2); §7 gained six Unit 04 edge cases
- **Decisions Made:**
  - **ADR #9** — duplicate = (`sourceProvider`, `sourceConversationId`), computed
    only in `storage/`. The compound index is intentionally non-unique so FR9's
    "Add anyway" can store a second copy
  - **ADR #10** — after deleting the active conversation, the adjacent entry (next,
    else previous) becomes active; Empty State only when nothing remains
  - **ADR #11** — proactive quota warning at ≥90% of `estimate()`; skipped, not
    faked, where the API is missing
  - Detection **and** insertion share one `db.transaction('rw', …)`, so FR2's
    atomicity also removes the check-then-write race
  - `storage/` returns `StorageResult<T>` and never throws, matching the `Result`
    pattern of Units 01–03; only `features/` turns an error into Persian text
  - `subscribeToLibrary()` wraps Dexie's `liveQuery`, which is what makes FR5's
    "no page reload" true by construction — the Sidebar re-renders from state
  - Per **FR10**, no message-bubble or theme code was written: `AppShell` renders
    `ActiveConversationPlaceholder`, the single seam Unit 06 replaces
  - Per **NFR2**, the Sidebar renders a plain list — no virtualization was added
- **Verification:** `npx tsc -b` ✅ · `npm run test` ✅ 266/266 (21 files) ·
  `npm run lint` ✅ 0 warnings · `npm run build` ✅
- **Next Session Starts With:** Unit 05 — write `05-conversation-metadata.md`, then
  surface the metadata that is already stored (`StoredConversation.conversation`)
  through `storage/`, never by opening Dexie in a component

### Session 7 — 2026-08-24

- **Work Done:** Completed and verified the fix for "clicking افزودن گفتگو does
  nothing", and closed the test gap that let the bug reach manual testing at all.
  The previous session had already landed most of the fix inside `ddfeb5a`
  ("wip: button bug fix in progress") but lost access before verifying or
  reporting; this session resumed from there
- **Trigger:** In every library state (empty · records with nothing selected ·
  conversation open), clicking the Sidebar's add button produced no visible
  change and no console output — while all Unit 04 tests stayed green
- **Root Cause:** `AppShell`'s main-region conditional rendered purely from
  *data-derived* facts (`entries.length === 0`, `activeEntry !== undefined`) and
  had no representation of an explicit import request. `openImport()` therefore
  changed nothing the renderer reads: over an empty library the Empty State
  re-emitted itself unchanged, and behind an open conversation so did the
  placeholder. A user intent ("show me the import screen") is state and must be
  stored, not inferred back from selection/library data; conflating "nothing is
  selected" with "the user asked to import" turned the action into a silent no-op
  exactly in the state every fresh user starts in
- **Fix (as landed in `ddfeb5a`):**
  - `features/library/useLibrary.ts` owns a dedicated `isImporting` flag:
    `openImport` sets it, `closeImport` clears it, and selecting a conversation
    also leaves the import screen (FR5)
  - `components/shell/AppShell.tsx` checks `isImporting` **first** in its
    conditional chain, so an explicit request outranks the inferred Empty State
    and works even while a conversation is open
  - `components/import/ImportPage.tsx` gained optional `onImported` / `onCancel`;
    the cancel affordance renders only when a library exists to return to
- **Regression Net (created by the interrupted session, verified here):**
  `tests/components/AppNavigation.test.tsx` — 9 integration tests rendering the
  real `App` over `fake-indexeddb` with nothing mocked: import opens from the
  sidebar in all three library states, from the Empty State's own CTA, the
  sidebar survives alongside it, selection leaves it, cancel lands on a real
  conversation without writing, and an explicit request outranks the Empty State.
  This exercises the click → state → conditional-render seam no isolated test
  touched
- **Net Proven by Fault Injection:** temporarily deleting the `isImporting` arm
  from `AppShell`'s conditional reproduced the reported bug under jsdom —
  `AppNavigation.test.tsx` failed 9/9 (exit 1) with the Empty State still on
  screen after the click — and restoring the arm returned it to green, proving
  the suite guards the behaviour, not an implementation detail
- **Housekeeping:** removed `vitest-out.txt` (a 724 KB vitest console dump the
  interrupted commit accidentally tracked at repo root) and gitignored the name
- **Verification:** `npm run build` ✅ · `npm run test` ✅ 275/275 (22 files) ·
  `npm run lint` ✅ 0 warnings
- **Next Session Starts With:** Unit 05 — write `05-conversation-metadata.md`
  first (unchanged from Session 6)

### Session 8 — 2026-08-24

- **Work Done:** Fixed the post-import focus gap found via manual testing and
  eliminated the whole class of "misleading Empty State" states (ADR #12)
- **Trigger:** After a successful import into a fresh library, the main region
  fell back to `LibraryEmptyState` — the "import your first file" screen — even
  though the library now held records, reading as if nothing had been saved.
  Every reload over a non-empty library reproduced the same message before any
  selection existed. The Sidebar's own add button was confirmed working and is
  untouched
- **Root Cause:** `AppShell`'s conditional used the Empty State both as "the
  library is empty" and as the fallback for "records exist but nothing is
  selected", while `addConversations` deliberately never touched `activeId` — so
  an import left the app in exactly that fallback state. The Session 7 lesson,
  one level deeper: two unrelated facts ("library empty", "nothing selected")
  must not share one render branch, and the spec was silent on post-import focus
- **Fix:**
  - `features/library/useLibrary.ts` — `addConversations` activates the LAST id
    of `result.savedIds` and clears `isImporting`, so the batch's newest
    conversation owns the main region through the FR10 placeholder;
    `confirmDuplicate` does the same for the stored copy after "Add anyway"
    (cancel/dismiss still changes nothing); a scoped effect activates the newest
    entry when the first load lands over a non-empty library with no selection
    this session
  - `components/shell/AppShell.tsx` — comments only: the trailing Empty-State
    branch is documented as purely defensive (active record deleted out-of-band),
    keeping `entries.length === 0` the sole *reachable* path to it
  - The duplicate-detection dialog itself is untouched (FR8/FR9 confirmed correct)
- **Tests:** `tests/components/ImportActivation.test.tsx` — 7 integration tests
  over the real pipeline (only the worker transport mocked; real validate →
  detect → parse → store → render): fresh-library import shows its placeholder,
  not the Empty State · multi-conversation batches activate the LAST saved item ·
  importing while reading switches focus · cancelling a duplicate prompt
  preserves the prior selection · "Add anyway" activates the stored copy ·
  loading a non-empty library auto-selects the newest record · deleting the
  active record out-of-band degrades to the Empty State while records remain
- **Verification:** `npm run build` ✅ · `npm run test` ✅ 282/282 (23 files) ·
  `npm run lint` ✅ 0 warnings
- **Next Session Starts With:** Unit 05 — write `05-conversation-metadata.md`
  first (unchanged from Session 7)

### Session 9 — 2026-08-24

- **Work Done:** Two approved Unit 04 UX revisions landed: (1) duplicate handling
  became a silent skip with ONE post-batch summary (ADR #13), removing
  `DuplicateImportDialog` and its "Add anyway" code path entirely; (2) a bulk
  «حذف همه‌ی گفتگوها» action was added behind exactly one destructive
  confirmation (ADR #14)
- **Change 1 — silent skip + summary (ADR #13):**
  - `features/library/importToLibrary.ts` returns `skippedDuplicates`
    (lightweight `{key}` records over FR8's natural key); `confirmDuplicateImport`
    is deleted — no code path stores a duplicate any more, which is what keeps
    FR9's real rule ("no silent automatic ADD") intact while scaling to large
    batches
  - `storage/conversationStore.ts`: the duplicate branch of `SaveOutcome` carries
    no payload; the dead `SaveOptions.allowDuplicate` flag was removed (signature
    is now `(conversation, database = db)`); schema v1 deliberately unchanged —
    legacy libraries may hold twin-keyed rows from ADR #9's policy
  - `features/library/importSummary.ts` (new) formats the single summary:
    «N گفتگو اضافه شد، M گفتگوی تکراری نادیده گرفته شد.» — rendered by `AppShell`
    as a non-blocking `role="status"` banner mirroring the error-banner pattern,
    in the success colour with a «بستن» dismiss; batches with zero duplicates stay
    silent (activation already confirms them)
  - ADR #12 untouched: the LAST *saved* id activates; a 100%-duplicate batch
    changes nothing but the summary
- **Change 2 — bulk clear (ADR #14):**
  - `storage/conversationStore.clearLibrary()` — one atomic
    `transaction('rw', …)` around `conversations.clear()`; success-as-no-op on an
    empty table; typed `StorageDeleteError` on failure
  - `Sidebar` gained a destructive «حذف همه‌ی گفتگوها» button below the import
    button, rendered only when `entries.length > 0`; it only *requests*
  - `components/library/ClearLibraryDialog.tsx` (new copy-only wrapper):
    title «حذف همه‌ی گفتگوها», description «همه‌ی گفتگوها برای همیشه از
    کتابخانه‌ی این مرورگر حذف می‌شوند. این عمل قابل بازگشت نیست؛ فایل‌های اصلی
    روی دستگاه شما تغییری نمی‌کنند.», confirm «همه را حذف کن»; on success the
    live subscription drives the genuine Empty State (`entries.length === 0`)
    while `activeId` is deliberately left alone (same reasoning as ADR #12)
- **Files Removed:** `src/components/library/DuplicateImportDialog.tsx` (and all
  of its flow's tests — nothing referenced it after the change)
- **Tests:**
  `tests/features/importToLibrary.test.ts` rewritten around skips (silent skip,
  retitled duplicate, distinct keys, mixed batch, empty shape);
  allow-duplicate storage tests removed and retitle-only coverage added in
  `tests/storage/duplicateKey.test.ts`; new `clearLibrary` block in
  `tests/storage/conversationStore.test.ts` (full clear · empty no-op · failure
  leaves records readable); Sidebar control visibility/request tests;
  AppShell e2e — exactly one dialog, cancel keeps everything, confirm empties to
  the Empty State; ImportActivation e2e — silent skip with selection preserved,
  mixed batch activates the last NEW item with correct counts, 100%-duplicate
  batch moves nothing
- **Verification:** `npm run build` ✅ · `npm run test` ✅ 288/288 (23 files) ·
  `npm run lint` ✅ 0 warnings
- **Next Session Starts With:** Unit 05 — write `05-conversation-metadata.md`
  first (unchanged from Session 8)

### Session 6 — 2026-08-26

- **Work Done:** Implemented Unit 05 (Conversation Metadata) end-to-end: a Shell-UI
  Metadata Panel that displays only the conversation-level metadata already stored
  on `UnifiedConversation` — title, createdAt, updatedAt (FR1 minus model, per
  ADR #15) — plus the always-on platform name and message count (FR2, "0" valid).
  Absent fields are dropped before rendering; nothing is invented or derived (FR4/FR6).
- **Files Created:**
  - `src/features/library/metadataFields.ts` — `CONVERSATION_METADATA_FIELDS`
    descriptor list (`{ key, label, accessor, format? }`) + pure
    `resolveMetadataFields()` (ADR #16); `messageCount` deliberately excluded
    because FR2 makes it structural, not optional
  - `src/features/library/useActiveConversationMetadata.ts` — resolves the active
    record through `storage/`'s `getConversation` (FR3), resets on selection
    change, cancels stale reads, degrades to empty fields on failed/empty reads
  - `src/components/library/MetadataPanel.tsx` + `.module.css` — `<dl>` of
    label/value rows over resolved fields; shell tokens only, no provider theme
  - `src/components/library/platformLabels.ts` — shared `PLATFORM_LABEL` map,
    extracted from `ConversationListItem` so Sidebar and Panel share one source
  - Tests: `tests/features/metadataFields.test.ts` (7),
    `tests/components/MetadataPanel.test.tsx` (5),
    `tests/features/useActiveConversationMetadata.test.tsx` (4)
- **Files Modified:** `src/components/shell/AppShell.tsx` (+ `.module.css`) — panel
  renders above `ActiveConversationPlaceholder`, which stays untouched as Unit 06's
  seam (Unit 04 FR10 intact); `ConversationListItem.tsx` (imports shared labels);
  `tests/components/AppShell.test.tsx` (+1 e2e test proving panel contents after a
  real selection); this tracker; `architecture.md` §7 → new "Metadata Display Rules"
- **Decisions Made:** ADR #15 (model omitted at conversation level) and ADR #16
  (descriptor list satisfies FR3/NFR2) — see §8. Export timestamps are formatted
  fa-IR by each entry's own `format`; unparseable values stay verbatim.
- **Testing Notes (for future units):**
  - Under React 19 + RTL, state updates from promises outside `act()` are invisible
    to both `waitFor` and `result.current` — flush with `await act(async () => { … })`
  - Module-mocking `storage/` proved brittle here; driving the REAL Dexie layer via
    `fake-indexeddb/auto` (the `AppShell.test.tsx` pattern) is the reliable convention
  - `\d` matches ASCII only — Persian-digit assertions need `[۰-۹]`
- **Verification:** `npx tsc -b` ✅ · `npm run test` ✅ **305/305 (26 files)** ·
  `npm run lint` ✅ 0 warnings · `npm run build` ✅
- **Next Session Starts With:** Unit 06 — write `06-multi-theme-rendering.md`,
  then replace `ActiveConversationPlaceholder` with themed message rendering

### Session 6 — 2026-08-26

- **Work Done:** Unit 06 (Authentic Multi-Theme Rendering) implemented end-to-end
  for DeepSeek; §4.6 first corrected from real screenshots (ADR #17)
- **Files Created:**
  - `src/themes/deepseek/tokens.css` — every §4.1 mandatory token, light + dark
    via `prefers-color-scheme` (the Shell's own mechanism); screenshot-corrected
    values (ADR #17); deliberately no Thinking-background token
  - `src/themes/deepseek/codeFences.ts` — verbatim ```-fence splitter (FR6); pure
  - `src/themes/deepseek/` — `DeepSeekConversationView` (theme entry),
    `DeepSeekMessage` (kind dispatch), `ThinkingBlock`, `AttachmentCard`,
    `ToolActivityRow`, `CodeBlock`, `CopyButton` (+ a CSS Module each)
  - `src/features/library/useActiveConversation.ts` — full record for the active
    id (mirrors `useActiveConversationMetadata`: reset-on-change, stale-cancel,
    graceful degradation)
  - `src/components/shell/ConversationStage.tsx` (+ css) — the single
    provider→theme dispatch point (ADR #18)
  - Tests: `tests/themes/deepseek.tokens.test.ts` (5), `tests/themes/`
    `deepseek.codeFences.test.ts` (7), `tests/components/DeepSeekMessage.test.tsx`
    (10), `tests/components/DeepSeekConversationView.test.tsx` (4),
    `tests/features/useActiveConversation.test.tsx` (4)
- **Files Modified:**
  - `src/components/shell/AppShell.tsx` — placeholder → `ConversationStage`
  - `package.json` — `lucide-react` added (ui-context §8's icon library;
    approved dependency D3)
  - `context/ui-context.md` §4.6 — screenshot corrections (ADR #17)
  - Tests moved to the new seam: `AppShell.test.tsx`, `AppNavigation.test.tsx`,
    `ImportActivation.test.tsx` — the placeholder's title heading no longer
    exists, so "which conversation is active" is asserted by themed content +
    the sidebar's `aria-current`
- **Files Deleted:** `ActiveConversationPlaceholder.tsx` + `.module.css` — the
  seam was consumed by design (Unit 04's FR10 hand-off complete)
- **Decisions Made:** ADR #17 (documentation correction) and ADR #18 (kind
  mapping, dispatch point, no fabricated THINK duration, Copy-only actions).
  No theme stubs for ChatGPT/Claude/Gemini — the same registry-scope discipline
  as Units 02/03 (ADR #5); their themes become follow-up units when real
  exports + verified specs exist
- **Testing Notes (for future units):**
  - `user-event` installs its own EventTarget-based `navigator.clipboard` stub
    during `setup()`, silently shadowing a test's own stub → assert clipboard
    writes with `fireEvent.click`, never `user.click`
  - `import.meta.url` is not a `file:` URL under the jsdom environment — read
    repo files from tests via `resolve(process.cwd(), …)`
  - Empty text must not become a DOM node: `splitCodeFences('')` returns `[]`
- **Verification:** `npx tsc -b` ✅ · `npm run test` ✅ **335/335 (31 files)** ·
  `npm run lint` ✅ 0 warnings · `npm run build` ✅
- **Next Session Starts With:** Unit 07 — write `07-in-chat-search.md`, then
  implement search on the existing storage + renderer seams

### Session 6 Follow-up — 2026-08-26 (manual-QA layout fixes)

- **Work Done:** two Shell-level scroll fixes from manual testing of Unit 06; no
  message-rendering logic and no theme tokens touched
  - **Independent scroll regions (FIX 1):** `.shell`'s implicit grid row was
    content-sized, so a tall page scrolled as ONE unit — sidebar included.
    Capped with `grid-template-rows: minmax(0, 1fr)` (mobile content row
    likewise), making each grid cell a bounded box that manages its own
    scrolling: the sidebar's list (already `overflow-y: auto` by design) and
    the conversation area now scroll independently
  - **Scroll reset on switch (FIX 2):** `ConversationStage` now renders a
    persistent scroll container and resets its `scrollTop` to 0 in an effect
    keyed on `entry.id`. The container deliberately lives in the SHELL, not in
    any theme's view — pure layout policy, so every future theme inherits
    correct scrolling and reset behavior for free (FR5/NFR3). MetadataPanel
    stays fixed above the scrolling region (ui-context §3)
- **Files Modified:** `src/components/shell/AppShell.module.css`,
  `src/components/shell/ConversationStage.tsx` (+ `.module.css`),
  `src/themes/deepseek/DeepSeekConversationView.tsx` (dropped its duplicated
  `data-conversation-id` — the record identity now lives only on the stage),
  `context/architecture.md` §7 (structural scroll rule recorded)
- **Files Created:** `tests/components/ConversationStage.test.tsx` (3);
  `tests/components/AppShell.test.tsx` (+1 integration test proving distinct
  regions and reset-on-switch); `tests/components/DeepSeekConversationView.test.tsx`
  updated to the new attribute ownership
- **Verification:** `npx tsc -b` ✅ · `npm run test` ✅ **339/339 (32 files)** ·
  `npm run lint` ✅ 0 warnings · `npm run build` ✅

### Session 10 — 2026-08-27

- **Work Done:** Deliverable row 4 ("Usage examples") — a pure docs/static
  addition. No source, no test, no design change.
- **Files Created:**
  - `examples/sample-deepseek-export.json` — copy of
    `tests/fixtures/deepseek/sample-rich.json` (renamed for end users).
    Covers all 8 fragment types: `REQUEST`, `RESPONSE`, `THINK`, `FILE`,
    `SEARCH`, `TOOL_SEARCH`, `TOOL_OPEN`, `TOOL_FIND`.
  - `examples/sample-deepseek-export-minimal.json` — copy of
    `tests/fixtures/deepseek/sample-real.json`. Minimal case: two
    conversations, only `REQUEST` / `RESPONSE`, no attachments, no tools.
  - `examples/README.md` — short note: what the files are, how to drag
    them into the app, one-line reminder that they're anonymized
    placeholders for trying the app, not real data.
- **Files Modified:** `context/project-overview.md` (Deliverables row 4
  ⏳ Pending → ✅ Completed); `context/progress-tracker.md` (§3 table
  gains a "Usage examples" row, this session note added to §9).
- **Decisions Made:** none — this is a docs/deliverable addition, not a
  design decision; no ADR per the task brief.
- **Source of truth preserved:** `tests/fixtures/deepseek/` was NOT
  modified; the canonical anonymized fixtures for the test suite stay
  exactly as-is. `examples/` is a user-facing copy.
- **Verification:** `npm run build` ✅ (no-op; static files outside `src/`,
  no lint/test impact expected — no test/lint run was necessary because
  nothing under `src/` or `tests/` changed).

### Session 11 — 2026-08-31

- **Work Done:** Unit 08 (Guided Import Flow) implemented and verified. The single-step import screen is now a 3-step flow: Platform → File → Confirm. Unit 01's pipeline is reused unchanged inside Step 2; Unit 02's `detectProvider` is the sole authority and the platform choice is only **compared** against what the file claims (never used to steer the parser). A read-only `countDuplicates` reuses the existing `findDuplicate` rule to populate the Step 3 preview, which is purely informational; the save transaction at confirm time is the unchanged `importToLibrary` pipeline. Four stylized SVG brand marks (DeepSeek, ChatGPT, Claude, Gemini) live in a new `platformOptions`/`PlatformIcons`/`PlatformPicker` trio, with only DeepSeek selectable and the other three answering with an inline «به‌زودی» notice while Continue stays disabled.
- **Files Created:**
  - `src/components/import/platformOptions.ts` — `PlatformOptionId`, `PLATFORM_OPTIONS`, `findPlatformOption` (id intentionally separate from `ProviderId`)
  - `src/components/import/PlatformIcons.tsx` — 4 minimal SVG marks colored via `--brand-*` tokens
  - `src/components/import/PlatformPicker.tsx` + `.module.css` — 2×2 grid, role=group, aria-pressed cards
  - `src/components/import/GuidedImportFlow.tsx` + `.module.css` — step indicator, mismatch banner, read-only duplicate preview, "تاييد و Import" confirm
  - `src/storage/conversationStore.ts` — appended `DuplicateCounts` + `countDuplicates` (read-only, no writes)
  - `tests/components/import/ImportPage.test.tsx` — rewritten 16 tests around the 3-step flow
  - `tests/components/ImportActivation.test.tsx` — 8 existing tests threaded through Step 1 → Step 2 → Step 3 (helpers `openImportAndPickDeepSeek`, `sidebarAddAndPickDeepSeek`)
- **Files Modified:**
  - `src/styles/shell.css` — 4 platform brand tokens (the only new hexes; everything else is token-driven)
  - `src/components/import/ImportPage.tsx` — thin shell delegating to `<GuidedImportFlow>`, same props preserved so `AppShell` is untouched
- **Pre-existing Lint Fix (out-of-spec but unblocks the gate):** `useConversationSearch` useEffect cleanup had no explicit return type; the lint gate now requires it, and the rule was missed at the unit's initial implementation. Same minimal fix (`return (): void => { ... }`) applied to the new `GuidedImportFlow` effect to keep the rule satisfied.
- **Decisions Made:**
  - Brand colors live in `styles/shell.css` as CSS custom properties; no component hardcodes a hex.
  - The Step 3 preview is read-only and never gates the save: the confirmation click still calls the unchanged `onConfirm` pipeline so ADR #13's batch summary continues to be the only post-import notice.
  - Test matchers avoid ZWNJs and exact Persian phrases wherever the production copy is editable; locale-stable signals (`data-status="error"`, role/aria-current, button names) are preferred.
- **Verification:** `npm run build` ✅ 0 errors · `npm run test` ✅ 376/376 passing (37 files) · `npm run lint` ✅ 0 errors / 0 warnings

### Session 12 — 2026-09-08

- **Work Done:** Unit 09 (Claude Platform Parser & Renderer) implemented from a real local export (~9.9 MB; census 29 conversations / 3380 live-line messages). Structure-only `detect()`; `parse()` orders messages with the sentinel-rooted last-child walk (ADR #22) behind one typed corruption gate (duplicate uuid / dangling parent / BFS reachability from the root, ADR #23); `normalization/claude.ts` maps the four attested fragment types (text / thinking / tool_use / tool_result) onto the unified model — unknown types preserved verbatim in `sourceFragment` — and `themes/claude/` renders a Claude-first surface (warm-paper tokens, markdown + code fences, thinking blocks, id-linked tool cards, size-optional attachment cards). Claude is enabled across the shell: platform picker (no «به‌زودی» badge), library label, metadata summary row, `ConversationStage` dispatch.
- **Files Created:**
  - `src/parsers/claude/{detect,types,parse,index}.ts`
  - `src/normalization/claude.ts`
  - `src/themes/claude/` — tokens.css + ClaudeConversationView / ClaudeMessage / ThinkingBlock / ToolBlock / AttachmentCard / CodeBlock / CopyButton (+ CSS modules), codeFences.ts, markdown.ts, toolLinking.ts
  - `tests/parsers/claude.detect.test.ts`, `tests/parsers/claude.parse.test.ts`, `tests/normalization/claude.normalize.test.ts`, `tests/normalization/claude.fixture.test.ts`, `tests/themes/claude.{tokens,codeFences,toolLinking}.test.tsx`
  - `tests/fixtures/claude/sample-export.json` (anonymized census-faithful fixture; the real export stays local-only per `context/fixtures/claude/README.md` + `.gitignore`)
- **Files Modified:** `types/providers.ts`, `types/conversation.ts` (`tool*`, `sourceFragment`, conversation `summary`), `detection/registry.ts`, `normalization/normalizeConversations.ts`, `themes/deepseek/AttachmentCard.tsx` (size chip only when a size exists), `components/shell/ConversationStage.tsx`, `components/import/platformOptions.ts`, `components/library/platformLabels.ts`, `features/library/metadataFields.ts`, `tests/fixtures/conversations.ts` + updated `registry.test.ts`, `parseConversations.test.ts`, `ImportPage.test.tsx`, `metadataFields.test.ts`
- **Decisions Made:** ADR #22 (last-child live-line walk) and ADR #23 (one reachability check subsumes cycle detection) — full records in `adr-log.md`. The hidden+summary thinking variant is pinned by an inline live-line fixture because a real export only shows it on dead regenerate branches the walk never visits. Docs updated: `docs/parsers.md` (Claude section), `ui-context.md` §4.4 (was already the implemented spec), this tracker.
- **Verification:** `npm run build` ✅ 0 errors · `npm run test` ✅ 456/456 passing (45 files) · `npm run lint` ✅ 0 errors / 0 warnings · real-file acceptance smoke ✅: the real export was detected → parsed → normalized (29 conversations, 3380 messages, unknownRole=0) and the first conversation rendered through `ClaudeConversationView` (smoke script run once and deleted, never committed)

### Session 13 - 2026-09-12

- **Work Done:** RTL assistant-row anchoring fix across both themes (bug report: assistant messages rendered flush to the physical RIGHT, same edge as the user bubble). Root cause: the assistant branch rendered only `.row` (`margin: 0`) - assistant-on-the-left existed in docstrings and 09b row 2 but was never implemented; in the RTL-locked app the block therefore started at the physical right. The assistant branch now carries a new `.assistantRow` class in both theme modules: a column flex container with `align-items: flex-end` (cross axis = inline axis; the inline end IS the physical LEFT in `dir="rtl"`), anchoring the whole assistant block (body + action row) left while the Persian text inside keeps its natural RTL flow (no text-align override; `justify-content: flex-end` on a row container was rejected - it would lay body and actions side by side). Unknown-role rows keep the plain full-width block (Unit 03 simplified rendering). Also hardened `.userMessage` with `min-width: 0` (belt-and-braces for the long-unbroken-string report; `overflow-wrap: anywhere` already present since before c98e65a).
- **Files Modified:** `src/themes/{deepseek,claude}/{DeepSeekMessage,ClaudeMessage}.{tsx,module.css}`, `tests/components/{DeepSeekMessage,ClaudeMessage}.test.tsx`
- **Files Created:** `tests/themes/{deepseek,claude}.alignment.test.ts` (static CSS-rule locks, tokens-test pattern; plus rendered wiring pins via `toHaveClass` with a `classOf()` guard, because vite/client types CSS-module exports as `string | undefined`)
- **Verification:** `npm run test` 475/475 passed (48 files); one earlier run showed a single `ImportActivation.test.tsx` failure under heavy background load - it passes deterministically in isolation with the changes present AND at the stashed baseline (8/8), so it is a load-sensitive pre-existing flake, not a regression; `npm run lint` exit 0; `npm run build` exit 0; dist verified verbatim: `._assistantRow_*{display:flex;flex-direction:column;align-items:flex-end}` x2, `._userRow_*{display:flex;justify-content:flex-start}` x2, `._userMessage_*{...min-width:0;...max-width:80%/70%}` x2, `justify-content:flex-end` count 0; assets `index-B-3eNsOA.js` + `index-DvEIzbYp.css`
- **Scope note:** THINK / tool_activity / attachment rows keep their existing full-width patterns (outside the reported bug; the text-branch rows were the reported surface).

### Session 14 - 2026-09-12

- **Work Done:** Tool-card token-collision fix + message-list containment hardening. The Claude tool-card tokens duplicated neighbouring tokens in both modes (`--claude-tool-bg` == `--claude-bg-surface` and `--claude-tool-border` == `--claude-border-default`), so the card's boundary vanished on the flat surface, and `.payload` rendered on `--claude-bg-base` (the page background) — the inset visually merged into the theme instead of reading as a panel on the card. Fix: tool tokens retuned to a deeper warm tint / stronger border (light `#ece9de` / `#d6d1c3`, dark `#343430` / `#4a4a46`) and `.payload` moved onto `--claude-bg-elevated` (the spec's modal/artifact token). Hardening: `min-width: 0` on both themes' `li.messageItem` (each row is a column-flex child, and the default automatic minimum size would let an unbroken string widen the `<ol>` past the column) and `max-width: 100%` on the tool `.card` — a content-driven `<details>` won't shrink by itself, so a huge payload's intrinsic width could push the card past the column (it now stays inside and scrolls in `.payload`).
- **Files Modified:** `src/themes/claude/tokens.css`, `src/themes/claude/ToolBlock.module.css`, `src/themes/{claude,deepseek}/{Claude,DeepSeek}ConversationView.module.css`, `tests/themes/claude.tokens.test.ts` (+tool tokens to the mode-dependent set, +collision-distinctness lock), this tracker
- **Files Created:** `tests/themes/claude.toolblock.test.ts`, `tests/themes/{claude,deepseek}.conversationView.test.ts` (static CSS locks, tokens/alignment-test pattern)
- **Verification:** `npm run test` ✅ 481/481 passing (52 files) with the run-once smoke included; committed state ✅ 480/480 passing (51 files) on two separate full runs; one intermediate full run showed the known load-sensitive `ImportActivation.test.tsx` flake (documented in Session 13) — it passes 8/8 in isolation with the changes present · `npm run lint` ✅ exit 0 / 0 warnings · `npm run build` ✅ exit 0 · real-file smoke render ✅: the real export detected → parsed → normalized (29 conversations, 3380 messages, unknownRole=0), a tool-bearing conversation rendered through `ClaudeConversationView` (129 items, 2 tool cards, 4 payload insets), and the resolved token sheet proves BOTH modes keep four pairwise-distinct layers (base/surface/elevated/tool-bg, payload on `#ffffff` / `#3a3a37`) with tool-border ≠ border-default — dist verified verbatim: `._payload_*{...background:var(--claude-bg-elevated);...}`, `@media(prefers-color-scheme:dark)` + `--claude-tool-bg: #343430`/`#4a4a46`, light `#ece9de`/`#d6d1c3` (smoke script run once and deleted, never committed)

### Session 15 - 2026-09-13

- **Work Done:** Conversation-surface background seam fix (approved Option A from the 2026-09-13 seam investigation). Root cause: each theme `.view` painted `--{theme}-bg-base` only on a 48rem-centred column, so on windows wider than the measure the shell background showed on both sides and the themed slab clashed with it - Claude worst (light `#faf9f5` vs `#ffffff`, dark `#212121` vs `#16181d`: the tokens never matched in either mode), DeepSeek matching in light by coincidence (`#ffffff`) but clashing in dark (`#1a1a1a` vs `#16181d`). Height coverage was already complete - the `.stage` flex chain inside the 100vh-capped grid row gives `.view` a definite containing box, so `min-height: 100%` already painted the whole visible region, tall or short - no height change was needed. Fix: `.view` is now the full-bleed themed surface (background + typography, `min-height: 100%`) and a new `.column` child carries the readable measure (`max-width: 48rem; margin: 0 auto`) plus the container padding, in both `themes/claude` and `themes/deepseek`. The seam can no longer appear on any window width.
- **Also on record:** the reported manual `background: none` edit on `ClaudeConversationView.module.css` was already absent from the working tree when investigated (only Session 14's `min-width: 0` hunk was uncommitted there), so no revert was needed.
- **Files Modified:** `src/themes/{claude,deepseek}/{Claude,DeepSeek}ConversationView.{tsx,module.css}`, `tests/themes/{claude,deepseek}.conversationView.test.ts` (+full-bleed backdrop / column-measure static locks), this tracker
- **Verification:** `npm run test` ✅ 482/482 passing (51 files) · `npm run lint` ✅ exit 0 / 0 warnings · `npm run build` ✅ exit 0 (`✓ built in 13.45s`)

### Session 16 - 2026-09-13

- **Work Done:** Unified activity toggle per spec `09c-claude-unified-activity-toggle.md`: each contiguous run of thinking/tool traffic between two text segments now renders as ONE `<details>` (summary «تفکر, tool1, tool2…», body = members in occurrence order as rows on one shared tool surface, text segments stay outside the toggle, no toggle without background activity). New pure pass `src/themes/claude/activityGrouping.ts` (linear scan on the visible sequence after `linkToolActivity`'s merged-result removal — the `content[]` boundary is already dissolved by normalization, so this is new render-layer logic, no parser/normalization change); new `ActivityGroup.tsx` + `ActivityGroup.module.css` (single card, hairline-separated rows, assistant-row anchoring, column containment); `ThinkingBlock` / `ToolBlock` gained `embedded` variants (static label/header + always-visible body, no own toggle, «خطا» badge survives via badge + start-edge error bar).
- **Files Created:** `src/themes/claude/{activityGrouping.ts,ActivityGroup.tsx,ActivityGroup.module.css}`, `tests/themes/claude.{activityGrouping,activityGroup}.test.ts`, `tests/components/{ActivityGroup,ClaudeConversationView}.test.tsx`
- **Files Modified:** `src/themes/claude/{ClaudeConversationView.tsx,ThinkingBlock.tsx,ThinkingBlock.module.css,ToolBlock.tsx,ToolBlock.module.css}`, this tracker
- **Verification:** targeted `npx vitest run` on the 7 Claude render/grouping suites ✅ 29/29 passing; `npm run lint` ✅ exit 0; full-suite `npm run test` / `npm run build` launched in-session — the captured log shows the suite progressing green (35 files / 363 tests passed at last captured snapshot) but the shell stayed busy and the final totals could not be observed before handoff, so re-run them to confirm the committed state

### Session 17 - 2026-09-13

- **Work Done:** Investigation + revert of the post-Session-16 "dir-independent hardening" attempt (uncommitted working-tree state, never in git history): unconditional `direction: rtl` had been added to `.userRow` and `.assistantRow` in both theme modules, with matching `direction: rtl` lock assertions in the two alignment tests. Manual DevTools testing proved the attempt wrong: with the app's real `dir="rtl"` it changed nothing visually (inheritance already produced the correct anchors), but with a manually flipped LTR document it *hardcoded* RTL geometry instead of mirroring - the opposite of "dir-independent". Codebase search confirms `dir` is never toggled at runtime (no `document.dir` / `setAttribute('dir')` / i18n switch anywhere; `index.html` is the single static source, `lang="fa" dir="rtl"`), so genuine LTR is a hypothetical, not a product path - and the correct fix for a hypothetical is to NOT hardcode a value: `flex-start`/`flex-end` already follow whatever the ancestor `dir` is via natural inheritance. Reverted all 4 declarations + comments and the 4 test-lock assertions, restoring Session 13's committed state exactly; `align-items: flex-end` deliberately KEPT on `.assistantRow`: it is a no-op for full-width assistant text (`fit-content` caps at the available width, which is why the manual removal test looked identical in rtl), but still anchors the `.actions` row of SHORT assistant replies to the physical left - without it, stretch would push the Copy button to the inline start (physical right in rtl, the user-bubble side). Net code effect: the 4 files are byte-identical to HEAD, so no CSS/test diff exists to commit.
- **Files Modified:** this tracker only (the CSS/test edits were a working-tree revert to HEAD, zero net diff)
- **Verification:** full-suite `npm run test` ✅ 506/507 - the single failure is the documented load-sensitive `ImportActivation.test.tsx` flake (Sessions 13/14), which passes ✅ 8/8 in isolation on rerun; `npm run lint` ✅ exit 0 / 0 warnings; `npm run build` ✅ exit 0 (`tsc -b && vite build`, 1922 modules) - this also closes Session 16's pending full-suite/build confirmation on top of HEAD; `git status` clean, `git diff` empty for the 4 reverted files (byte-identical to `9952f55`)

### Session 18 - 2026-09-13

- **Work Done:** Applied the user's manual DevTools-tested result: `align-items: flex-end` removed from `.assistantRow` in BOTH theme modules and the removal made permanent, superseding Session 17's deliberate keep. Both `.assistantRow` rules are now bare column stacks (`display: flex; flex-direction: column`), so children stretch full-width: the assistant text starts at the inline start (physical right, the user-bubble side) and `.actions` (plain flex row, no `justify-content`) packs the Copy button (+ Claude's `.actionDate`) directly under that same edge. Confirmed answer to the stated check: YES - the action row moves from the physical LEFT to the physical RIGHT, and it does so on EVERY assistant message, not only short ones (the Session 17 note's "SHORT assistant replies" phrasing was imprecise: under `flex-end` the shrink-to-fit `.actions` box hugged the inline end regardless of message length; message length only decided whether a SHORT reply's text block visibly moved with it). On long messages the body looked identical before/after; on short messages the body's start edge moves too. `.userRow` untouched (`justify-content: flex-start` via natural dir inheritance - Session 17). Alignment tests: the `align-items: flex-end` lock replaced with a permanent-removal lock (`not.toContain('align-items')` + kept `not.toContain('justify-content')`), renamed to "keeps assistantRow a plain column stack - the physical-left anchor stays gone"; the "moves only the block anchor" test renamed to "keeps the Persian text alignment natural across all row rules"; stale physical-LEFT docstrings/comments rewritten across both TSX modules, both component tests, and both CSS file-top/rule comments. Finalized with the user's follow-up decision: `direction: rtl` added explicitly to `.userRow` in BOTH themes (`justify-content: flex-start` kept as-is; `.assistantRow` deliberately untouched as configured above) - the user row keeps its RTL geometry even if an ancestor dir ever changes, a user-tested deviation from Session 17's inheritance-only stance scoped to the user row only; the alignment tests now lock the pin on the userRow block (`toContain('direction: rtl')`) and its absence on the assistantRow block (`not.toContain('direction: rtl')` - a bare `not.toContain('direction')` would false-positive on the rule's own `flex-direction: column`).
- **Files Modified:** `src/themes/{deepseek,claude}/{DeepSeekMessage,ClaudeMessage}.{tsx,module.css}`, `tests/themes/{deepseek,claude}.alignment.test.ts`, `tests/components/{DeepSeekMessage,ClaudeMessage}.test.tsx`, this tracker
- **Verification:** targeted 4-suite `npx vitest run` (both alignment + both message suites) ✅ 35/35; full-suite `npm run test` ✅ 507/507 (55 files) - the documented `ImportActivation.test.tsx` flake passed on this run; `npm run lint` ✅ exit 0 / 0 warnings; `npm run build` ✅ exit 0 (`tsc -b && vite build`, 1922 modules, built in 9.53s); dist verified verbatim: `._userRow_*{display:flex;justify-content:flex-start;direction:rtl}` x2, `._assistantRow_*{display:flex;flex-direction:column}` x2 (no align-items, no direction), `direction:rtl` count 2 in the whole dist (the 7 `direction:ltr` hits are the pre-existing LTR code line-box pins), `justify-content:flex-end` count 0, `align-items:flex-end` count 0; assets `index-D010N5PZ.js` + `index-sW_D8zg8.css`

### Session 19 - 2026-09-16

- **Work Done:** Unit 10 (Gemini Platform Parser & Renderer) completed end-to-end from the real local Google Takeout «My Activity» export (census: 23 Activity items / 7 conversations / 24 drafts, file order reverse-chronological). Parser layer (`detect` structure-only Activity signature; `parse` = item validation + `details[0].url` grouping + ascending re-sort with undated values kept last), normalization (`درخواست: ` prefix stripped defensively, title derived from the first non-empty user text with the single 80+… rule, turn `time` verbatim on both messages with `createdAt`/`updatedAt` derived, extra drafts as `alternatives` of ONE assistant message, attachment ownership decided by `imageFile` presence), theme layer (`src/themes/gemini/`: `tokens.css` per §4.5; `sanitizeHtml.ts` = DOMPurify allow-list built from the tag census + `splitCodeBlocks` lifting top-level `<pre>` into Copy-barred code blocks via a DOM-node move that never re-escapes by hand + `toPlainText`; `GeminiConversationView`; `GeminiMessage`; `DraftToggle` = the FR11 «پیش‌نویس 1/2» chip; `AttachmentCard` = name-only placeholders with the icon chosen from the export's own extension; `CopyButton` duplicate), and shell wiring.
- **Files Created:** `src/parsers/gemini/{detect,types,parse,index}.ts`, `src/normalization/gemini.ts`, `src/themes/gemini/{tokens.css, sanitizeHtml.ts, GeminiConversationView.{tsx,module.css}, GeminiMessage.{tsx,module.css}, DraftToggle.{tsx,module.css}, AttachmentCard.{tsx,module.css}, CopyButton.{tsx,module.css}}`, `tests/parsers/gemini.{detect,parse}.test.ts`, `tests/normalization/gemini.{normalize,fixture}.test.ts`, `tests/themes/gemini.{sanitize,tokens,alignment,conversationView}.test.ts`, `tests/themes/gemini.draftToggle.test.tsx`, `tests/components/Gemini{Message,ConversationView}.test.tsx`, `tests/fixtures/gemini/sample-export.json` (synthetic, census-faithful: 6 items / 4 conversations covering the dual-draft turn, both attachment situations, an unprefixed title, reverse-chronological file order; the real export stays local per `context/fixtures/gemini/README.md`)
- **Files Modified:** `types/providers.ts`, `types/conversation.ts` (`alternatives`, ADR #25), `detection/registry.ts`, `normalization/normalizeConversations.ts`, `components/shell/ConversationStage.tsx` (`case 'gemini'`), `components/import/platformOptions.ts` (`available: true`), `components/library/platformLabels.ts`, `tests/detection/registry.test.ts` + `tests/parsers/parseConversations.test.ts` (third fixture entry), `tests/components/import/ImportPage.test.tsx` (Gemini is no longer pending: one roadmap badge left, coming-soon case moved to ChatGPT), `tests/components/ConversationStage.test.tsx` (Gemini dispatch case), `docs/parsers.md` (Gemini registered: provider row + «Gemini activity items» section; the stale "neither registered nor parsed" note is now ChatGPT-only), this tracker
- **Decisions Made:** code blocks are lifted at the **top level only** (a nested `<pre>` degrades to styled HTML inside its run — the census shows top-level `<pre><code>`); **no language label** on Gemini code blocks (the export is pre-rendered HTML, so a label would be invented data; the bar says «کد» and carries Copy per §4.5); **Copy copies the visible text** (`toPlainText`), not the export's markup, while `content` stays verbatim HTML; `--gemini-link-text` added because §4.5's brand blue (#4285F4) is ~3.6:1 on white and §13 demands AA for body text (links use #1A73E8 light / #8AB4F8 dark); code surfaces are Google grey #F1F3F4 light / #131314 dark, kept distinct from `--gemini-bg-surface` (locked by test, the Session 14 lesson); the draft chip **clamps a stale index** (conversation switching reuses a row whose `order` key survived, so a two-draft index must never index past a one-draft message); `CopyButton` is a deliberate §12 duplicate.
- **Verification:** `npm run test` ✅ 610/610 passing (66 files) · `npm run lint` ✅ exit 0 / 0 warnings · `npm run build` ✅ exit 0 (`tsc -b && vite build`, 1934 modules, built in 12.55s) · real-export acceptance ✅ via a temporary in-place run (deleted afterwards, committed tests never read the local file): AC1 23 items → exactly 7 conversations / 48 messages (23 user + 23 answers + 2 attachments), AC2 ascending everywhere, AC3 the single dual-draft turn → one assistant message + one alternative, AC4 conversation `b87b9155c31d54a7` → assistant-owned png + user-owned jpg name-only placeholders, titles derived, prefix-free and 80+… truncated.

### Session 20 - 2026-09-22

- **Work Done:** Unit 11b, steps **11b-0 + 11b-1 only** (spec `11b-chatgpt-theme-renderer.md`): 11b-0 = the seven §4.3 doc amendments (avatar rows removed from Color Palette/Chat Bubble Pattern/Icons, Message Actions reduced to Copy-only with the hover-reveal + touch fallback wording, Thread Date Line subsection added, neutral-grey bubble note recording the no-blue decision, `--chatgpt-text-primary`/`-text-muted`/`-code-text`/`-code-inline-bg` palette rows, and the Spacing table's radius/gap/container-padding values pinned). 11b-1 = the ChatGPT theme itself, **20 files** under `src/themes/chatgpt/`, every one a standalone copy of its Claude twin re-tokened to `--chatgpt-*` (cross-theme imports forbidden): `tokens.css` (§4.3 neutrals, light/dark via `prefers-color-scheme`), `ChatGPTConversationView` (+ Thread Date Line, empty state, containment contract), `ChatGPTMessage` (+ inline-code chip, unsupported-fragment placeholder, no avatar, hover/focus-revealed Copy-only action row, 6-line collapsible user bubble), `ActivityGroup` + `activityGrouping.ts` (single `<details>` per contiguous run; reasoning = `thoughts`/`reasoning_recap`/`commentary`; **no** `toolUseId` pairing — 11a emits none, so there is no `linkToolActivity`/`cards` layer), `ReasoningBlock` (embedded, static, no fabricated duration), `ToolRow` (name from the activity, `ابزار` fallback, raw verbatim input/output, no error badge), `AttachmentCard` (name + size only when exported), `CodeBlock` + `codeFences.ts` + `CopyButton` + `markdown.ts` (same hardened marked→DOMPurify pipeline as the other themes), and the mapped test set (8 files, incl. a **new** theme-isolation scan forbidding cross-theme imports and out-of-token hex — no existing test covered either).
- **Files Created:** `src/themes/chatgpt/{tokens.css, activityGrouping.ts, ChatGPTConversationView.{tsx,module.css}, ChatGPTMessage.{tsx,module.css}, ActivityGroup.{tsx,module.css}, ReasoningBlock.{tsx,module.css}, ToolRow.{tsx,module.css}, AttachmentCard.{tsx,module.css}, CodeBlock.{tsx,module.css}, codeFences.ts, CopyButton.{tsx,module.css}, markdown.ts}`, `tests/themes/chatgpt.{tokens,alignment,activityGrouping,activityGroup,codeFences,isolation}.test.ts`, `tests/components/ChatGPT{Message,ConversationView}.test.tsx`
- **Files Modified:** `context/ui-context.md` (§4.3), this tracker. **Superseded by 11b-2 in this same session (Session 21):** `components/import/platformOptions.ts`, `components/shell/ConversationStage.tsx` and `ImportPage.test.tsx` below are now wired and ChatGPT is `available: true` in the picker.
- **Decisions Made:** user bubble stays a **neutral grey** (`#F4F4F4`/`#2F2F2F`) — the blue in the owner's screenshots is a personal accent setting, not a product default, so no blue token exists (FR-1/ADR-M); **no model avatar** anywhere (doc gap #4 — the screenshots show none, so no compensating icon was invented); actions are **Copy only** (ADR-L: Edit/Regenerate/Like-Dislike are decorative in a read-only viewer and were removed outright, revealed on hover/focus with the `@media (hover: none)` always-visible fallback); the inline-code chip **intentionally reuses** the user-bubble neutral (documented non-collision, unlike Claude's tool card) but is locked distinct from the dark code slab; the group summary falls back to the same `ابزار` label `ToolRow` renders so a collapsed line never names nothing; per-message date = the export's own timestamp only (FR-7), Thread Date Line = `createdAt` → first message → nothing, always `fa-IR`. ADR-log rows landed in 11b-3 as #37/#38/#39 (Session 21).
- **Verification:** `npx vitest run tests/themes/chatgpt tests/components/ChatGPT` ✅ 63/63 (8 files) · `npm run test` ✅ 760/760 (78 files) · `npm run lint` ✅ exit 0 / 0 warnings · `npm run build` ✅ exit 0 (`tsc -b && vite build`, 1934 modules)

### Session 21 - 2026-09-22 (Unit 11 closed)

- **Work Done:** 11b-2 + 11b-3, closing Unit 11. 11b-2: `platformOptions.ts` → ChatGPT `available: true` (FR-10); the 11a placeholder branch in `ConversationStage.tsx` replaced with `case 'chatgpt'` rendering `ChatGPTConversationView` under the same loading→view contract as the other three (FR-2, ADR #18 — other themes untouched); `ImportPage.test.tsx` coming-soon assertions removed (no «به‌زودی» badge anywhere, stale "future ChatGPT module" seam comment corrected) with the ChatGPT dispatch case added to `ConversationStage.test.tsx` (FR-10); the deferred UI acceptance AC1–AC4 committed as 5 tests over the real guided flow with the real pipeline (`chooseChatGptAndContinue`, fixture JSONs dropped → preview → confirm → `onImported`): minimal.json → 1 conversation / 3 messages / title intact; structure.json → only the 3 live messages, no system/hidden/context leak; both shards → 3 records (`shard-a1/a2/b1`) with the manifest rejected on its own; the mismatch banner names both platforms in **both** directions with Continue disabled. 11b-3: `README.md` + `docs/parsers.md` document ChatGPT as supported-**Unverified** (provider row, "ChatGPT content types" census table, provisional ADR-A banner); ADR log gained **#37/#38/#39** for ADR-K/L/M (the FR-5-in-two-places entry already existed as ADR #35 — deliberately not duplicated); this tracker marks Unit 11 ✅ complete.
- **Files Modified (11b-2 + 11b-3):** `src/components/import/platformOptions.ts`, `src/components/shell/ConversationStage.tsx`, `tests/components/import/ImportPage.test.tsx` (+5 acceptance tests, coming-soon removal), `tests/components/ConversationStage.test.tsx` (ChatGPT dispatch case), `README.md`, `docs/parsers.md`, `context/adr-log.md` (#37/#38/#39), this tracker (Unit 11 ✅, 11b Completed-Units row, Session 21). **Not touched:** `src/types/conversation.ts`, parsers, normalization, the other three themes; no new dependencies.
- **Verification:** `npx vitest run tests/themes/chatgpt tests/components/ChatGPT` ✅ 63/63 (8 files) · full `npm run test` ✅ 765/765 (78 files — the lone `ImportActivation` line-item is the documented load-sensitive flake, green 8/8 in isolation with the changes present) · `npm run lint` ✅ exit 0 / 0 warnings · `npm run build` ✅ exit 0 (`tsc -b && vite build`, 1954 modules, `index-GcDOk4Gg.js` / `index-BTq7w9YG.css`).

