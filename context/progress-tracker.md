Full ADR history: see adr-log.md. Older session notes: see session-archive.md. Older edge cases: see edge-cases-archive.md.
# Progress Tracker

> Update this file after every meaningful implementation change.
> This file is the bridge between sessions — it restores full context in one read.

---

## 1. Current Phase

- **Phase:** Development
- **Current Goal:** Unit 11 (ChatGPT Platform) تکمیل شد — **11a ✅** (provider module، normalization، registry، فیکسچرها، تستها، ADRها)، **11b ✅** (Theme + رندر + فعالسازی picker + پذیرش UI برای AC 1–4 + مستندات و ADRهای 37–39). ChatGPT در picker `available: true` است ولی همچنان **Unverified** می‌ماند تا نمونه‌ی Export واقعی همین سوئیت را پاس کند (ADR-A).

---

## 2. Build Plan Overview

> Source of truth for unit order: `context/feature-specs/00-build-plan.md`

| Unit | Name                            | Status       | Spec                                            |
| ---- | ------------------------------- | ------------ | ----------------------------------------------- |
| 01   | Import & Validation             | ✅ Completed | `01-import-validation.md`                       |
| 02   | Platform Auto-Detection         | ✅ Completed | `02-platform-detection.md`                      |
| 03   | Modular Parsing System          | ✅ Completed | `03-modular-parsing-system.md`                  |
| 04   | Local Chat Library              | ✅ Completed | `04-local-chat-library.md`                      |
| 05   | Conversation Metadata           | ✅ Completed | `05-conversation-metadata.md`                   |
| 06   | Authentic Multi-Theme Rendering | ✅ Completed | `06-multi-theme-rendering.md`                   |
| 07   | In-Chat Search                  | ✅ Completed | `07-in-chat-search.md`                          |
| 08   | Guided Import Flow (Platform Selection → Upload → Confirm) | ✅ Completed   | `08-guided-import-flow.md`                      |
| 09   | Claude Platform Parser & Renderer | ✅ Completed | `09-claude-platform-parser-renderer.md` |
| 11   | ChatGPT Platform (Parser, Normalization, Rendering) | ✅ Completed | `11-chatgpt-platform.md` + `11b-chatgpt-theme-renderer.md` (11a provider/normalization + 11b-0 §4.3 docs + 11b-1 theme + 11b-2 picker/stage/UI acceptance AC1–AC4 + 11b-3 README/parsers/ADRs 37–39; ChatGPT **Unverified** — synthetic fixtures only) |

**Status Legend:** ✅ Completed · 🔄 In Progress · ⏳ Pending · ❌ Blocked

---

## 3. Deliverables Status

| #   | Deliverable                                                     | Status         | Notes                                                                                           |
| --- | --------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Import pipeline (`features/import/`)                            | ✅ Completed   | Type gate → Worker → JSON validation → typed `ParseResult`                                      |
| 2   | Import pipeline Web Worker (`workers/importPipeline.worker.ts`) | ✅ Completed   | Reads + parses + detects + normalizes off the main thread (one round-trip)                      |
| 3   | Shared error model (`types/errors.ts`)                          | ✅ Completed   | `ParseError` / `ParseResult`; extended per unit as needed                                       |
| 4   | Import UI (`components/import/`)                                | ✅ Completed   | Dropzone, per-file status list, large-file warning                                              |
| 5   | `detection/` (registry + `detectProvider`)                      | ✅ Completed   | Single registry; `findProviderModule()` is also Unit 03's `parse()` hook                        |
| 5b  | `parsers/{provider}/` modules                                   | ✅ Completed   | `deepseek` (Unit 03) + `claude` (Unit 09, ADR #22/#23) + `gemini` (Unit 10, ADR #24) parsed from real exports; `chatgpt` (Unit 11a, ADR #27/A — provisional, **Unverified** until a real export passes the suite; renderer + picker in Unit 11b) |
| 5c  | `normalization/` (unified model)                                | ✅ Completed   | Sole producer of `UnifiedConversation`; one mapper per registered provider                      |
| 6   | `storage/` (Dexie) + library UI                                 | ✅ Completed   | Sole owner of IndexedDB (FR3); atomic writes, duplicate detection with silent-skip batch summary, bulk clear-all, Sidebar + Confirm Dialogs |
| 7   | `themes/` per-platform rendering                                | ✅ Completed   | Unit 06 (DeepSeek) + Unit 09 (Claude) + Unit 10 (Gemini) + Unit 11b (`themes/chatgpt/`, copy-and-restyle of Claude, no cross-theme imports): `tokens.css` + renderers; shell dispatch via `ConversationStage` (ADR #18) for all four; ChatGPT documented as **Unverified** |
| 8   | Metadata Panel (`features/library/` + `components/library/`)    | ✅ Completed   | Declarative field-descriptor list (ADR #16); conversation-level `model` omitted (ADR #15); FR2 message count always rendered |
| 9   | Usage examples (`examples/`)                                     | ✅ Completed   | Anonymized DeepSeek samples (rich + minimal) copied from `tests/fixtures/deepseek/` + `examples/README.md`; no code/test changes; not a design decision (no ADR) |

---

## 4. Completed Units

| Unit | Feature                 | Date Completed | Notes                                                                                                         |
| ---- | ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| 01   | Import & Validation     | 2026-08-20     | Syntax + non-empty validation only; no provider detection (deferred to Unit 02). 45 tests passing             |
| 02   | Platform Auto-Detection | 2026-08-21     | Single registry + `detectProvider()`; DeepSeek signature from a real export. 81 tests passing                 |
| 03   | Modular Parsing System  | 2026-08-22     | `parse()` + `normalization/` for **DeepSeek only** — the sole registered provider (ADR #5). 134 tests passing |
| 04   | Local Chat Library      | 2026-08-24     | Dexie persistence + Sidebar; duplicate key = (provider, sourceConversationId) (ADR #9). 266 tests passing     |
| 05   | Conversation Metadata   | 2026-08-26     | Metadata Panel driven by a declarative field-descriptor list (ADR #16); `model` omitted at conversation level (ADR #15). 305 tests passing     |
| 06   | Authentic Multi-Theme Rendering | 2026-08-26 | DeepSeek theme only (sole registered provider, ADR #5); `themes/deepseek/` tokens + kind-dispatched renderer; placeholder seam replaced (ADR #17/#18). 335 tests passing |
| 07   | In-Chat Search                  | 2026-08-29 | Live search index projected in `subscribeToSearchIndex`; Sidebar swap driven by `search` prop. 346 tests passing |
| 08   | Guided Import Flow              | 2026-08-31 | 3-step picker (Platform → File → Confirm) wraps Unit 01; only DeepSeek is selectable, others show a «به‌زودی» notice (FR1–FR4). `countDuplicates()` reuses `findDuplicate` for the read-only Step 3 preview. 376 tests passing |
| 09   | Claude Platform Parser & Renderer | 2026-09-08 | Second provider from a real export: signature detect, sentinel-rooted last-child order (ADR #22) with one reachability gate (ADR #23), `themes/claude/` renderer + shell enablement. 456 tests passing |
| 09b–09d | Claude visual/functional stabilization (corrective specs on Unit 09) | 2026-09-13 | Closed by Sessions 13–18 (final commit `9b3b3da`): 09b theme parity with the real claude.ai UI (background seam, RTL row anchoring finalized — assistant block flush right on the same edge as the user bubble, conflicting `align-items: flex-end` anchors removed and permanently test-locked), 09c unified Thinking/Tool activity toggle, 09d long-user-message collapse (show more/less, mirrored into the DeepSeek theme). DeepSeek fixes rode along in the same pass (user-bubble physical-right, code/log LTR wrap, tool-card contrast). 507 tests / 55 files green; lint + build clean |
| 10   | Gemini Platform Parser & Renderer | 2026-09-16 | Third provider from a real Google Takeout `My Activity` export: Activity-signature `detect()`, `details[0].url` grouping + ascending re-sort, drafts kept as `alternatives` (ADR #25), verbatim timestamps (ADR #26), `themes/gemini/` HTML-sanitizing renderer + shell enablement. 610 tests passing |
| 11a | ChatGPT provider module, normalization, registry, fixtures, tests, ADRs (spec 11 §8) | 2026-09-21 | Third-party + provisional provider (ADR #27/A, **Unverified**): structure-only `detect()` (≥1 matching node + file-wide absence of DeepSeek's `fragments`, ADR #32/F), FR-3 conversation isolation with skip-and-record (`ChatGptRawData.skipped`, ADR #35/J — an all-skipped file still fails loudly), FR-4 active-branch walk (`current_node` → last-child → time-ordered, cycle/dangling-parent tolerant), FR-6 content-type map, FR-7 citation stripping (message text only), ADR #34/I Unix-seconds→ISO. ChatGPT stays `available: false` in the picker (11b). Synthetic fixtures under `tests/fixtures/chatgpt/` + gitignored slot for the real export (`context/fixtures/chatgpt/README.md`) |
| 11b | ChatGPT theme, picker activation, UI acceptance, docs (spec 11b §8: 11b-0 → 11b-3) | 2026-09-22 | **765 tests / 78 files green; lint + build clean** · 11b-0: §4.3 amendments (Session 20) — avatar rows removed from Color Palette/Chat Bubble Pattern/Icons, Message Actions Copy-only with hover/focus reveal + touch fallback, Thread Date Line subsection, neutral-grey bubble (no blue token), `--chatgpt-text-primary/-text-muted/-code-text/-code-inline-bg` rows, Spacing values pinned. 11b-1: `src/themes/chatgpt/` (20 files, each a copy-and-restyle of its Claude twin, no cross-theme imports — ADR #37) + mapped test set (8 files, incl. the new isolation scan) · Copy-only actions (ADR #38). 11b-2: `platformOptions.ts` `available: true`, `ConversationStage` `case 'chatgpt'` (same loading→view contract), `ImportPage.test.tsx` coming-soon removal + real-UI acceptance AC1–AC4 (ChatGPT dispatch case in `ConversationStage.test.tsx`). 11b-3: `README.md` + `docs/parsers.md` (ChatGPT present, **Unverified**), ADR log #37/#38/#39 (FR-5-in-two-places already present as ADR #35 — not duplicated). ChatGPT stays **Unverified** until a real export passes the suite |

---

## 5. In Progress

| Unit | Feature | Started | Progress |
| ---- | ------- | ------- | -------- |
| 12   | Next platform or hardening (owner's call) | — | Unit 11 closed 2026-09-22: all four platforms parser-backed, themed, and picker-selectable; ChatGPT **Unverified** (synthetic fixtures only). The provisional ChatGPT shape must be re-checked against the first real export (`context/fixtures/chatgpt/README.md` → Verification gate) |

---

## 6. Next Up

- **Next:** Unit 11 is complete (11a + 11b). The provisional ChatGPT shape must be re-checked against the first real export (`context/fixtures/chatgpt/README.md` → Verification gate); until then ChatGPT stays **Unverified**. Any next platform or hardening pass is the owner's call — the picker offers all four platforms with no pending badge, and the shell dispatches all four themes.

### Closing note — Sessions 13–18 (Claude/DeepSeek visual & functional stabilization pass, closed 2026-09-13)

Sessions 13–18 were the full stabilization pass for the Claude experience, with the DeepSeek fixes that rode along in the same commits: RTL row anchoring taken from bug report → DevTools-verified final state (user bubble flush physical-right with an explicit `direction: rtl` pin; assistant block a plain full-width column stack flush to the same edge, the conflicting `align-items: flex-end` anchors removed and locked by permanent regression tests after one investigated-and-reverted misstep), exact background parity with the app shell (Session 15 seam resolved), unified Thinking/Tool activity toggle (09c), and long-user-message collapse (09d) mirrored into both themes. Each fix is guarded by static CSS-rule locks or component tests, so the final state cannot silently regress. Final state: 507 tests / 55 files green, lint and `tsc` clean, production build clean — committed as `9b3b3da`.

---

## 7. Open Questions

> Unresolved product or technical decisions that must be answered before proceeding.

| #   | Question                                                                                                                                                            | Raised By | Date       | Status                   | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which chat JSON format should the parsing layer normalize to? (The project says "ChatGPT, DeepSeek, Claude, Gemini" — but these all have different JSON structures) | Agent     | 2026-06-26 | 🔄 Partially resolved    | The unified target now exists: `types/conversation.ts` (`UnifiedConversation`), produced only by `normalization/`. DeepSeek is fully implemented from a real export. **Revised 2026-08-23:** the model is no longer text-only — a full census of a real DeepSeek export showed 8 fragment types across 3 payload categories, so `UnifiedMessage` gained a `kind` discriminator plus `attachments` / `toolActivity` (ADR #7). This makes the unified model markedly likelier to absorb the other providers' attachments and tool calls without another breaking change. ChatGPT / Gemini still need real exports before their `detect()`/`parse()`/`normalize()` can be written — inventing their shapes is forbidden (`ai-workflow-rules.md` §3, ADR #5). **Revised 2026-09-08 (Unit 09):** Claude is now fully implemented from a real export (detect → parse → normalize verified live on the file: 29 conversations / 3380 messages, zero unknown roles), proving the unified model absorbed a second provider without a breaking change. **Revised 2026-09-16 (Unit 10):** Gemini implemented from the real Google Takeout «My Activity» export — a third shape (flat Activity items, no per-message id/role) absorbed by the same model. **Revised 2026-09-21 (Unit 11a):** ChatGPT is implemented from the spec's cross-checked third-party research plus the owner-supplied sample — the first *provisional* provider (ADR #27/A): fixtures are synthetic, ChatGPT is **Unverified** until a real export passes the same suite, and the shape must be re-checked then (`context/fixtures/chatgpt/README.md` → Verification gate). |
| 2   | Should system-level fonts be used, or should fonts be self-hosted in the repo?                                                                                      | Agent     | 2026-06-26 | ✅ Resolved              | Architecture forbids network requests → system-native fonts only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 3   | Should a conversation's `updatedAt` come from the export's `updated_at`, or be recomputed from its newest message?                                                  | Agent     | 2026-08-22 | ✅ Resolved (2026-08-23) | **The export's own conversation-level `updated_at`, verbatim — never recomputed** (ADR #8). The two are provably different values: in `sample-real.json` `updated_at` is `23:25:55.182` while its newest message is `23:25:52.537`, because a conversation can change without gaining a message. Locked in by tests in `deepseek.normalize.test.ts` and `deepseek.fixture.test.ts`. Unit 04/05 may still sort by "time of last message" — that stays derivable from `messages`, whereas an overwritten `updated_at` would not be recoverable                                                                                                                                                                                                                      |
| 4   | فیکسچر واقعی export برای ChatGPT، Claude، Gemini هنوز موجود نیست — Unit 08 چطور با این ۳ پلتفرم رفتار کند؟                                                          | Human/Agent | 2026-08-29 | ✅ Resolved — **superseded 2026-09-22:** هر ۴ پلتفرم اکنون selectable‌اند (Unit 09/10/11b) و هیچ کارت «به‌زودی»ای باقی نمانده؛ فقط ChatGPT به‌خاطر نبود نمونه‌ی واقعی **Unverified** می‌ماند | کارتهای این ۳ پلتفرم قابل انتخاب هستند اما پیام «بهزودی پشتیبانی میشود» نشان داده میشود و ادامه فلو مسدود میماند — این رفتار با Unit 09 (Claude)، Unit 10 (Gemini) و Unit 11b (ChatGPT) به‌تدریج حذف شد                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

---

## 8. Architecture Decisions (ADRs)

> Moved to `context/adr-log.md` - the single source of truth for all ADRs
> (decision table #1-#23 and the detailed Unit-07/Unit-09 records, "ADR #19 -
> In-Chat Search" / "ADR #22" / "ADR #23"). Consult it before any architectural
> change.

---

## 9. Session Notes

> Context needed to resume work in the next session. Updated by the agent at the end of each session.
> Older notes (Sessions 1-20) are archived verbatim in `context/session-archive.md`.

### Session 21 - 2026-09-22 (Unit 11 closed)

- **Work Done:** 11b-2 + 11b-3, closing Unit 11. 11b-2: `platformOptions.ts` → ChatGPT `available: true` (FR-10); the 11a placeholder branch in `ConversationStage.tsx` replaced with `case 'chatgpt'` rendering `ChatGPTConversationView` under the same loading→view contract as the other three (FR-2, ADR #18 — other themes untouched); `ImportPage.test.tsx` coming-soon assertions removed (no «به‌زودی» badge anywhere, stale "future ChatGPT module" seam comment corrected) with the ChatGPT dispatch case added to `ConversationStage.test.tsx` (FR-10); the deferred UI acceptance AC1–AC4 committed as 5 tests over the real guided flow with the real pipeline (`chooseChatGptAndContinue`, fixture JSONs dropped → preview → confirm → `onImported`): minimal.json → 1 conversation / 3 messages / title intact; structure.json → only the 3 live messages, no system/hidden/context leak; both shards → 3 records (`shard-a1/a2/b1`) with the manifest rejected on its own; the mismatch banner names both platforms in **both** directions with Continue disabled. 11b-3: `README.md` + `docs/parsers.md` document ChatGPT as supported-**Unverified** (provider row, "ChatGPT content types" census table, provisional ADR-A banner); ADR log gained **#37/#38/#39** for ADR-K/L/M (the FR-5-in-two-places entry already existed as ADR #35 — deliberately not duplicated); this tracker marks Unit 11 ✅ complete.
- **Files Modified (11b-2 + 11b-3):** `src/components/import/platformOptions.ts`, `src/components/shell/ConversationStage.tsx`, `tests/components/import/ImportPage.test.tsx` (+5 acceptance tests, coming-soon removal), `tests/components/ConversationStage.test.tsx` (ChatGPT dispatch case), `README.md`, `docs/parsers.md`, `context/adr-log.md` (#37/#38/#39), this tracker (Unit 11 ✅, 11b Completed-Units row, Session 21). **Not touched:** `src/types/conversation.ts`, parsers, normalization, the other three themes; no new dependencies.
- **Verification:** `npx vitest run tests/themes/chatgpt tests/components/ChatGPT` ✅ 63/63 (8 files) · full `npm run test` ✅ 765/765 (78 files — the lone `ImportActivation` line-item is the documented load-sensitive flake, green 8/8 in isolation with the changes present) · `npm run lint` ✅ exit 0 / 0 warnings · `npm run build` ✅ exit 0 (`tsc -b && vite build`, 1954 modules, `index-GcDOk4Gg.js` / `index-BTq7w9YG.css`).

---

## 10. Edge Cases Encountered

> Older edge cases: see `context/edge-cases-archive.md`. Only the 5 most recent entries are kept here.

| Edge Case                                                                                         | Discovered In Unit | Handling Strategy                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude's export omits `file_size` on most attachments (unlike DeepSeek)                                                | Unit 09        | The attachment size chip renders only when a size exists — never a fabricated `0 B`; `deepseek/AttachmentCard.tsx` gained the same conditional so both themes share the rule |
| Gemini's answer is stored as raw HTML, so the search haystack contains markup too                                       | Unit 10        | FR7 keeps the answer verbatim and the search layer reads the shared model provider-agnostically, so tags are searchable v1 behaviour — documented, not special-cased per provider |
| A two-draft turn rendered as two messages would fabricate a reply the platform never sent (and break AC1's count)       | Unit 10        | ADR #25: one assistant message per turn, extra drafts in `alternatives`; only the theme's Draft chip reaches them, every other consumer keeps reading `content` |
| Conversation switching reuses a message row (same `order` key), so a stale two-draft index could index past a one-draft answer | Unit 10 | The draft index is clamped to the active message's own draft count — the answer degrades to its first draft, never renders empty |
| §4.5's brand blue (#4285F4) is ~3.6:1 on white — below §13's AA floor for body text                                     | Unit 10        | Body links use a dedicated `--gemini-link-text` (#1A73E8 light / #8AB4F8 dark); the brand blue stays on decorative accents and the theme file documents the reading |


---
