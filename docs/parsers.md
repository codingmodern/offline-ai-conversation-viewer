# Adding a Platform (Provider) Module

> How to register a new platform in the detection **and** parsing layers.
> Introduced in Unit 02 (Platform Auto-Detection), extended by Unit 03
> (Modular Parsing System).

Adding a platform must never require changing detection logic, normalization
dispatch for other providers, or any other provider module
(`02-platform-detection.md` FR8, `03-modular-parsing-system.md` FR5,
`architecture.md` Invariant #3). Concretely, only the steps below.

---

## Pipeline at a glance

```
file → validateJsonText() → detect() → parse() → normalize() → UnifiedConversation[]
         Unit 01             Unit 02    Unit 03    Unit 03        handed off (Unit 04 persists)
```

Two boundaries matter and are enforced by tests:

| Rule                                                                                                              | Where                         |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `parse()` returns **Provider Raw Data**, never `UnifiedConversation`                                              | `parsers/{provider}/parse.ts` |
| `normalize()` is the **only** producer of `UnifiedConversation`, and reads only `parse()` output — never raw JSON | `normalization/{provider}.ts` |

---

## 1. Get a real export first

Do **not** write a signature from an assumed format
(`ai-workflow-rules.md` §3 — "never invent product behaviour").

Save a real, anonymized export as
`tests/fixtures/{provider}/sample-real.json`.

## 2. Add the provider id

`src/types/providers.ts`:

```ts
export type ProviderId = 'deepseek' | 'chatgpt';
```

## 3. Create the module

`src/parsers/{provider}/detect.ts` — the signature,
`src/parsers/{provider}/types.ts` — the Raw Data shape,
`src/parsers/{provider}/parse.ts` — the parser, and
`src/parsers/{provider}/index.ts` — the module object:

```ts
import type { ProviderModule } from '@/types/providers';
import { detect } from './detect';
import { parse } from './parse';

export const chatgptProvider: ProviderModule = { id: 'chatgpt', detect, parse };
```

Rules for `detect(rawJson: unknown): boolean`:

| Rule                                                | Why                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Judge **structure only** (keys, object/array shape) | File name / extension must not influence detection (FR2)                         |
| Import nothing from another `parsers/*` module      | Invariant #3 — providers stay independent                                        |
| Be specific enough to exclude the other platforms   | Two matches = the file is **rejected** as ambiguous, not silently assigned (FR7) |
| Return `false` rather than throwing on odd input    | Detection treats a throwing `detect()` as "no match" and logs it                 |

Rules for `parse(rawJson: unknown): ParseResult<ProviderRawData>`:

| Rule                                                      | Why                                                                                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Return **Provider Raw Data**, never `UnifiedConversation` | Producing the unified model is `normalization/`'s exclusive job (FR1/FR3)                                                     |
| Return a typed `ParseResult`; never `throw`               | `MissingFieldError` (field absent) / `UnexpectedTypeError` (wrong JSON type) — one bad file must not break the pipeline (FR6) |
| Never demand more structure than `detect()` checks        | Otherwise a _detected_ file can fail to parse — the gap Invariant #2 forbids                                                  |
| Derive every field from the real fixture                  | An unproven field is optional, not assumed (`ai-workflow-rules.md` §3)                                                        |
| Import nothing from another `parsers/*` module            | Invariant #3                                                                                                                  |

## 4. Add the normalizer

`src/normalization/{provider}.ts` maps Raw Data → `UnifiedConversation[]`, and
`src/normalization/normalizeConversations.ts` gains one `switch` arm on
`providerId`. Because `parse()` already proved the structure, the normalizer
takes a typed input and cannot fail.

Preserve rather than discard: an unrecognised role becomes `'unknown'`, never a
dropped message (spec → Edge Cases).

## 5. Register it

`src/detection/registry.ts` — one line:

```ts
export const PROVIDER_MODULES: readonly ProviderModule[] = [deepseekProvider, chatgptProvider];
```

This is the **only** registry, and `findProviderModule()` is the single
`parse()`-resolution hook. Never add a second registry (FR1/FR2).

---

## Tests to add

| Test                                                              | Location                                           |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| Real fixture is detected                                          | `tests/parsers/{provider}.detect.test.ts`          |
| Other platforms' fixtures are **not** detected                    | same file                                          |
| Real fixture parses; malformed input yields the right typed error | `tests/parsers/{provider}.parse.test.ts`           |
| Roles/metadata map correctly, unknown roles survive               | `tests/normalization/{provider}.normalize.test.ts` |
| End-to-end detect → parse → normalize on the fixture              | `tests/parsers/parseConversations.test.ts`         |
| Fixture list still matches the registry size                      | `tests/detection/registry.test.ts`                 |

Run the full checklist before committing (`ai-workflow-rules.md` §4):
`npm run build` · `npm run test` · `npm run lint`.

---

## Current providers

| Provider   | Deciding structure                                                                                                                                            | Parsing notes                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepseek` | Top-level **array** of conversations, each with a `mapping` object whose message nodes carry `fragments[]`, each with a `type` (8 attested values, see below) | Message order comes from walking `mapping` via `children`, **not** from `inserted_at` (each RESPONSE is stamped before its REQUEST). Fragment types map to `kind` + `role` per the table below; an unknown type becomes `role: 'unknown'` and is preserved, never dropped |

### DeepSeek fragment types

A real export carries far more than request/response pairs. Only three types hold
`content`, so **a field is critical per category, never globally** — treating
`content` as universally required made every `FILE`/`SEARCH`/`TOOL_*` fragment a
`MissingFieldError` and blocked real imports outright.

| Raw `type`    | Payload in the export                           | `kind`          | `role`                  |
| ------------- | ----------------------------------------------- | --------------- | ----------------------- |
| `REQUEST`     | `content`                                       | `text`          | `user`                  |
| `RESPONSE`    | `content`                                       | `text`          | `assistant`             |
| `THINK`       | `content`                                       | `text`          | `assistant`             |
| `FILE`        | `files[]` (`file_id`, `file_name`, `file_size`) | `attachment`    | inherited from its turn |
| `SEARCH`      | `results` (sometimes)                           | `tool_activity` | `assistant`             |
| `TOOL_SEARCH` | `results` (sometimes)                           | `tool_activity` | `assistant`             |
| `TOOL_OPEN`   | none                                            | `tool_activity` | `assistant`             |
| `TOOL_FIND`   | none                                            | `tool_activity` | `assistant`             |

Rules that follow from this, and that a new provider should copy:

- **`results` is never critical.** Present → copied through verbatim; absent → the
  field is omitted, never invented as an empty value.
- **`THINK` is not a third role.** It is assistant text; a renderer separates
  reasoning from a final answer via `sourceFragmentType`, which always holds the
  raw type.
- **An unrecognised type is preserved**, not rejected: `kind: 'text'` with no
  content and `role: 'unknown'`, so a future export version cannot block an import.

| `claude`   | Top-level **array** of conversations; each message node carries a `uuid` / `parent_message_uuid` link and a `content` array of typed fragments (4 attested values, see below) | Message order comes from a sentinel-rooted **last-child walk** of the `parent_message_uuid` tree (ADR #22) — never from array order and never from timestamps. Corrupt graphs (duplicate uuid, dangling parent reference, unreachable island/cycle) fail parse with `UnsupportedFormatError` (ADR #23). Fragment types map to `kind` + `role` per the table below; an unknown type is preserved verbatim in `sourceFragment` |

| `gemini`   | Top-level **array** of Activity items; every item carries `title` + `details[].url` + `safeHtmlItem[]`, and none of them is a conversation object | Each item is **one turn** (ADR #24). Grouping uses the conversation id inside `details[0].url`; the file is reverse-chronological, so conversations and their turns are re-sorted **ascending** by `time`. Extra `safeHtmlItem` members are the *alternatives* of one answer (ADR #25), never extra messages. There is no per-message role/model and no conversation title — the title is derived from the first user message |

| `chatgpt`  | Top-level **array** of conversation objects, each carrying a `mapping` of message nodes whose `message.author.role` and `message.content.content_type` are strings, and which never carries a DeepSeek `message.fragments` key | Message order comes from walking `mapping` along the branch the export itself names — `current_node` when present, else the last child at each fork (ADR-B). The visibility filter (system role, weight 0, visually hidden, editable-context) is applied in parser **and** normalization (ADR #35); a corrupt conversation is skipped with a reason in `ChatGptRawData.skipped` instead of failing the file, and only an all-skipped file fails loudly. `thoughts` / `reasoning_recap` / the `commentary` channel stay assistant `text` with their raw value in `sourceFragmentType` (ADR #33). Times are the export's Unix seconds → ISO-8601 UTC in normalization (ADR #34). Content types map to `kind` + `role` per the table below; an unknown type becomes a contentless `text` message with the type preserved in `sourceFragmentType`/`sourceFragment` |

> Status: ChatGPT's parser and theme are **implemented but Unverified** —
> no real export has been provided yet (ADR-A). Everything above is attested by
> the synthetic fixture suite (`tests/fixtures/chatgpt/` + `tests/normalization/chatgpt.fixture.test.ts`),
> which mirrors the census of the owner's descriptions and stays provisional
> until a real export passes the same suite (`context/fixtures/chatgpt/README.md`).
> The provider shipped in Unit 11a; its renderer and picker availability in
> Unit 11b.

### Claude fragment types

Claude stores each message's body as a `content` array of typed fragments. The
census of the real export (29 conversations, 3380 live-line messages) attests
four fragment types. Thinking bodies may be blank — hidden fragments carry only
a summary entry — so the `thinking`/`summaries` payloads stay optional and only
the fragment `type` is critical.

| Raw `type`     | Payload in the export                                                       | `kind`          | `role`      |
| -------------- | --------------------------------------------------------------------------- | --------------- | ----------- |
| `text`         | `text`                                                                      | `text`          | from `sender` (`human` → `user`, `assistant` → `assistant`) |
| `thinking`     | `thinking` (may be blank) + `summaries[]`                                   | `text`          | `assistant` |
| `tool_use`     | `id`, `name`, `input` (any JSON)                                            | `tool_activity` | `assistant` |
| `tool_result`  | `tool_use_id`, `content` (array of typed blocks), `is_error` (sometimes)    | `tool_activity` | `assistant` |

Rules that follow from this, and that a new provider should copy:

- **Ordering is a graph walk, not a sort.** The live conversation is one child
  per node — the **last** child in array order (ADR #22). Dead regenerate/edit
  branches, and whole subtrees hanging off them, are excluded by design: they
  are Claude's UI-side history, not the conversation.
- **Corruption fails loudly, never silently truncates** (ADR #23): duplicate
  uuid, dangling parent, or messages unreachable from the sentinel root (which
  subsumes cycles — a cycle node's parent is always another cycle node) each
  raise `UnsupportedFormatError`.
- **`tool_use`/`tool_result` travel as separate fragments but describe one
  step.** The payloads stay verbatim (`toolInput`/`toolOutput`); the renderer
  pairs them by id at display time.
- **An unrecognised fragment type is preserved** in `sourceFragment` on a
  contentless `text` message — nothing is dropped (ADR #6's rule in Claude's
  vocabulary).
- **A message-level `text` mirror exists** and is used only when `content`
  carried no fragments; fragments win when present.
- **Attachments may lack a size.** `files[]` carries `file_name` always but
  `file_size` only sometimes, so the renderer shows the size chip only when a
  size exists instead of fabricating one.

### Gemini activity items (Google Takeout «My Activity»)

The Gemini source is not a native chat export: it is Takeout's My Activity
array, where each element is one *turn*. The census of the real export (23
items / 7 conversations) attests:

| Export field                                             | Meaning in the unified model                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `title` (always prefixed `درخواست: `)                    | the user's text, prefix stripped; a `title` without the prefix is used whole (defensive fallback)                           |
| `safeHtmlItem[].html`                                    | the model's answer, **pre-rendered HTML** — never converted to or from Markdown                                             |
| `safeHtmlItem[1..]`                                      | further drafts of the same answer → `alternatives` on that one message (ADR #25)                                            |
| `attachedFiles` / `imageFile`                            | file names only, no bytes → name-only placeholders; `imageFile` marks the user's own upload, its absence the model's image   |
| `details[0].url`                                         | the conversation key; its last path segment becomes `sourceConversationId`                                                  |
| `header` / `products` / `activityControls` / `subtitles` | ignored at parse time: they carry no usable information (FR9)                                                               |

Rules that follow from this, and that a new provider should copy:

- **One Activity item = one turn, and one turn = one assistant message.** A
  turn with two drafts keeps its extra drafts in `alternatives` (ADR #25):
  gluing them into `content` or emitting two messages would fabricate replies
  the platform never sent.
- **Ordering is re-derived, never trusted.** The file is descending, so
  conversations and turns are both sorted ascending by `time` (stable sort); an
  undated — or unparseable — value keeps its file position, last.
- **The answer HTML is untrusted and is sanitized at the theme boundary**
  (`themes/gemini/sanitizeHtml.ts`, main thread): `normalize()` runs inside the
  worker with no DOM access, so sanitization can never happen there
  (Invariant #5).

### ChatGPT content types (provisional, ADR-A)

Until a real export arrives, the table below is attested by the synthetic
fixture suite only (`tests/fixtures/chatgpt/`, driven by the owner's
descriptions). Reasoning and tool traffic each keep their raw value in
`sourceFragmentType` so the renderer can group them without re-reading the
source (Unit 11b, ADR #37).

| Raw `content_type` / role        | `kind`          | `role`     |
| -------------------------------- | --------------- | ---------- |
| `text`, `multimodal_text`        | `text`          | from role  |
| `thoughts`, `reasoning_recap`    | `text`          | `assistant`|
| commentary channel (assistant)   | `text`          | `assistant`|
| `code`, `execution_output`, `computer_output`, `tether_browsing_display`, `tether_quote` | `tool_activity` | from role |
| assistant message addressed to a tool (e.g. `recipient: 'dalle'`) | `tool_activity` | `assistant` |
| `image_asset_pointer` parts, `metadata.attachments` | `attachment` | from role |
| anything else                    | `text`, no body | from role  |

Rules that follow from this:

- **No tool-use ids exist in ChatGPT data**, so renderer rows are unpaired —
  Claude's id-pairing is not copied (ADR #37).
- **Citation markers are stripped from message text only** (the private-use
  `U+E200…U+E201` span and the `【…】` bracket form); tool payloads stay
  verbatim (ADR-E).
- **Image pointers carry no name** — the chip uses the shared `فایل پیوست`
  placeholder; sizes render only when the export records one (FR-6).
- **Large exports arrive as shards**: `conversations-NNN.json` files each
  parse independently; a manifest-style extra JSON fails alone with the
  existing `UnsupportedFormatError` (ADR-H).
