# Examples

Anonymized sample DeepSeek export files you can drag into the app's import
screen to try it out — no real personal data, no real conversation text.

## Files

| File | Purpose | Fragment types covered |
|------|---------|------------------------|
| `sample-deepseek-export.json` | Rich example with attachments, reasoning, and tool activity — exercises the full set of UI surfaces. | `REQUEST`, `RESPONSE`, `THINK`, `FILE`, `SEARCH`, `TOOL_SEARCH`, `TOOL_OPEN`, `TOOL_FIND` |
| `sample-deepseek-export-minimal.json` | Minimal example — two plain conversations, no attachments, no tools. Good for a first look. | `REQUEST`, `RESPONSE` |

## How to use

1. Build and run the app locally (`npm install` then `npm run dev`).
2. Open the import screen.
3. Drag either file from this folder into the dropzone (or use the file
   picker). The app will auto-detect the DeepSeek format and render the
   conversation(s).

## A note

These files are **for trying the app**, not real user data. All file
names, IDs, URLs, and message content are placeholders
(`placeholder-document.pdf`, `file-0000000000000001`,
`https://example.invalid/...`, `"Sample message content"`, etc.). The
canonical, anonymized versions used by the test suite live in
`tests/fixtures/deepseek/` — this folder is a user-facing copy.
