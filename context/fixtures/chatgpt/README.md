# ChatGPT Fixtures — synthetic only (no real export yet)

## Status: **Unverified**

No real ChatGPT export has been available to this project, so ChatGPT is
documented as **Unverified** everywhere it appears. The parser is deliberately
defensive because of it (ADR-A), and the whole provider stays provisional until
a real export is run through the same suite (spec 11 → Verification gate).

## Committed fixtures (all synthetic)

Everything under `tests/fixtures/chatgpt/` is **synthetic**: written by hand
from the spec's cross-checked research (spec 11 → Research Basis) and from the
owner-supplied sample, never derived from a real personal export. That is what
keeps the committed suite reproducible on any machine.

| File | Purpose |
|---|---|
| `minimal.json` | The owner-supplied sample, **unchanged** (1 conversation, 3 messages: user, assistant, user). Its shape — `mapping` + `author.role` + `content.content_type` — is the primary confirmation that the signature is real. |
| `structure.json` | `message: null` root, a `system` node, a visually-hidden node, a `weight: 0` node, both editable-context types, null times, and **no** `current_node` (exercises the FR-4 fallback). |
| `branching.json` | Regenerated/edited branches where the active path is neither the first nor the last child, plus a conversation with no `current_node` (last-child path). |
| `content-types.json` | `multimodal_text` with an image pointer, `code`, `execution_output`, `computer_output`, `thoughts`, `reasoning_recap`, `tether_browsing_display`, both context types, `super_widget`, an unknown type, a commentary-channel message, a metadata attachment, and an assistant message addressed to a tool. |
| `citations.json` | Private-use (`U+E200…U+E201`) and bracket (`【…】`) citation markers, including one inside a tool payload that must stay verbatim. |
| `persian.json` | RTL + ZWNJ + mixed English/Persian + a fenced code block. |
| `hostile.json` | Four entries in order: valid · no `mapping` (skipped with a reason) · a children-cycle plus a dangling `parent` (imported via the FR-4 fallback) · valid. |
| `shards/conversations-000.json`, `shards/conversations-001.json` | Two shards of one export (2 + 1 conversations), used to prove multi-file import needs no new UI (FR-2). |
| `shards/not-a-conversation.json` | A manifest-shaped object root: it must fail alone with the existing unsupported-format error and never block the shards. |

## Reserved location for the real export (local-only, never committed)

```
C:\Users\<username>\Desktop\data\chatgpt\conversations.json
```

- The real export is a personal file containing private conversation content.
  Committing it would leak personal data into the repository history
  (`ai-workflow-rules` §3 + spec 11 → NFR "nothing from the export is written to
  git").
- Everything under `context/fixtures/chatgpt/` except this README is git-ignored
  (see the `context/fixtures/chatgpt/*` block in the repository root
  `.gitignore`).
- **How to use it:** run the manual acceptance pass (import → library → unit
  checks) against that path directly, in place. The file is never copied into
  the repository. The committed vitest suite must never read it.

## Verification gate (what to check when a real export arrives)

Re-run, against the real file, the questions the synthetic set can only
approximate — and log any difference as a new ADR rather than adjusting the
parser silently:

- the detection signature (`mapping` node with `author.role` + a string
  `content.content_type`, and no `message.fragments` anywhere);
- the full census of `content.content_type` values against FR-6's map;
- `author.role` values (is there anything beyond user/assistant/tool/system?);
- whether `current_node` always resolves, and whether real files contain
  cycles or detached subtrees at all;
- the shapes inside `metadata.attachments[]` and `content.parts[]`
  (`image_asset_pointer` fields, `thoughts` entries, `result`);
- citation-marker forms beyond the two documented ones;
- sharding (`conversations-000.json` …) and whether a real export nests
  conversations differently.

Do **not** regenerate these fixtures from memory of the sample if a format
question reopens — re-derive from the real file, then update the README table
above and the ADR log together.
