# Completed Units Archive

> Verbatim archive of Completed-Units rows formerly kept in `progress-tracker.md` Section 4.
> The oldest entries are preserved here verbatim, oldest first; the 3 most recent entries
> (11b, 12, 13) remain in `progress-tracker.md`.

---

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
