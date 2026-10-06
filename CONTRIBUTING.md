# Contributing to Offline AI Conversation Viewer

Thanks for your interest in contributing! This project is a fully offline,
client-side viewer for AI chat export files. It has **no backend, no network
requests, and no telemetry** — everything happens in the browser.

Please read this guide fully before opening a pull request. Two of the rules
below are hard rules enforced by project convention, not suggestions.

---

## Table of Contents

1. [Spec-First Workflow (hard rule)](#1-spec-first-workflow-hard-rule)
2. [Real-Fixture-First for Platform Parsers (hard rule)](#2-real-fixture-first-for-platform-parsers-hard-rule)
3. [Running the Project Locally](#3-running-the-project-locally)
4. [Commit Convention](#4-commit-convention)
5. [Pull Request Expectations](#5-pull-request-expectations)
6. [Good First Issues](#6-good-first-issues)

---

## 1. Spec-First Workflow (hard rule)

**No code is written before a spec exists under `context/feature-specs/` and has
been reviewed and approved.**

This is a hard rule, not a suggestion. It comes from
[`context/ai-workflow-rules.md`](context/ai-workflow-rules.md) §2 (Spec-driven,
step-by-step development — one spec unit at a time) and §10 (never invent
requirements; never change an approved spec without an explicit request). The
context files (`architecture.md`, `ui-context.md`, `code-standards.md`) define
**what** the system is; feature specs define **how** a specific unit of work
gets built.

The workflow is:

1. Describe the feature as a spec in `context/feature-specs/`
   (numbered like the existing ones, e.g. `14-your-feature-name.md`).
2. Get the spec reviewed and approved **before** writing any implementation code.
3. Implement only what the spec covers — one spec unit at a time, no scope
   creep into the next unit (§2 "Scoping Rules").
4. If a requirement is ambiguous or missing, resolve it in the relevant context
   file or raise it as an Open Question in `context/progress-tracker.md`
   **before** continuing (§3). Never invent product behavior.

**Example spec (read this first):**
[`context/feature-specs/13-platform-grouped-sidebar.md`](context/feature-specs/13-platform-grouped-sidebar.md)
— it shows the real format used in this repo: Goal → User Flow → Functional
Requirements (FR1, FR2, …) → Non-functional Requirements → UI Behavior →
Validation → Edge Cases → Acceptance Criteria. Specs in this repo may be
written in **either English or Persian** — write in the language you are most
comfortable in, as long as the structure above is followed.

A PR that implements a feature with no approved spec will be closed.

---

## 2. Real-Fixture-First for Platform Parsers (hard rule)

**No parser or detection logic may be written from an assumed, guessed, or
second-hand description of a platform's export structure. A real export sample
must be censused first.**

If you are touching anything under `src/parsers/`, `src/detection/`, or
`src/normalization/` for a platform:

1. Obtain a **real export file** from that platform (e.g. Claude's
   `conversations.json`, a Google Takeout "My Activity" export).
2. Run a one-off census against it — enumerate the real keys, field types,
   fragment/message types, branching structure, and detection signature.
3. Record the census results in the relevant spec
   (`context/feature-specs/…`) and in `context/fixtures/{provider}/README.md`.
4. Only then write `detect()` / `parse()` / `normalize()`, and pin them with
   synthetic fixtures under `tests/fixtures/{provider}/` whose shape is derived
   from that census.

### Why this rule exists

- **ADR #1** ([`context/adr-log.md`](context/adr-log.md)): only providers that
  have a real sample export get registered — _"writing a signature from a
  guessed format would invent product behaviour and produce false matches"_, and
  unknown files must fail safe with `UnsupportedFormatError`.
- **ADR #5** (same file): stub parsers for platforms without a real export were
  rejected because they _"would be dead code asserting a format nobody has
  verified, and would fail the same rule as ADR #1"_.
- `context/ai-workflow-rules.md` §3: if a platform's JSON structure is unknown
  or differs from expectations, a real export sample must be examined and the
  structure documented in a fixture **before** writing the parser.
- History proves the point: a DeepSeek parser written against a small fixture
  broke on the real export, which had 8 fragment types instead of 3 (ADR #7).

This is also why **ChatGPT is labeled `Unverified`** everywhere — no real
export was available, so it shipped with synthetic fixtures and a defensive
parser instead (ADR #27/A).

### If you don't have a real export

**Do not guess.** Open an issue using the
**New Platform Support** template (`.github/ISSUE_TEMPLATE/new_platform_support.yml`)
describing the platform instead. If you _do_ have a real export but can't share
it, say so in the issue — a maintainer can work with you privately on the census.

### Privacy

Real exports contain private conversation content and are **never committed**.
They live outside the repository (git-ignored), and committed tests read
synthetic fixtures derived from the census. See the existing convention in:

- [`context/fixtures/claude/README.md`](context/fixtures/claude/README.md)
- [`context/fixtures/gemini/README.md`](context/fixtures/gemini/README.md)
- [`context/fixtures/chatgpt/README.md`](context/fixtures/chatgpt/README.md)

Never paste real conversation content, keys, or file contents into issues, PRs,
specs, or fixtures.

---

## 3. Running the Project Locally

Requirements: **Node.js** (latest stable LTS recommended) and **npm**.

```bash
# Install dependencies
npm install

# Start the dev server (Vite)
npm run dev

# Run the test suite once (Vitest)
npm run test

# Run tests in watch mode (while developing)
npm run test:watch

# Lint — must finish with 0 problems (ESLint, --max-warnings 0)
npm run lint

# Type-check and build for production (tsc -b && vite build)
npm run build

# (Optional) Format everything with Prettier
npm run format
```

There are no network calls, backend services, or environment variables — the
app is fully client-side.

---

## 4. Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/), as defined in
`context/ai-workflow-rules.md` §8:

| Prefix      | When to use                                    |
| ----------- | ---------------------------------------------- |
| `feat:`     | A new feature                                  |
| `fix:`      | Bug fix                                        |
| `chore:`    | Maintenance, dependencies, tooling             |
| `docs:`     | Documentation only                             |
| `refactor:` | Code change with no bug fix and no new feature |
| `test:`     | Adding or updating tests                       |
| `style:`    | Formatting only, no production code change     |

Example:

```
feat: add ChatGPT parser and detection module
```

Branch naming follows `code-standards.md` §8: `feat/feature-name`,
`fix/bug-name`, `refactor/what`, `docs/what`.

---

## 5. Pull Request Expectations

Before requesting review, every PR must satisfy all of the following:

- [ ] **Tests pass** — `npm run test` finishes green.
- [ ] **Lint is clean** — `npm run lint` reports 0 problems (warnings count as
      failures: the script runs with `--max-warnings 0`).
- [ ] **Build is clean** — `npm run build` completes without errors.
- [ ] **A spec exists** for any feature work, and it was approved before
      implementation (§1 above).
- [ ] **Real-fixture-first** is respected for any parser/detection change
      (§2 above), with fixture + tests included.
- [ ] **Docs are in sync.** If the change affects architecture, UI, code
      standards, feature scope, or progress, the matching `context/` file must
      be updated **in the same PR** — see
      [`context/ai-workflow-rules.md`](context/ai-workflow-rules.md) §7
      ("Keeping Docs in Sync"): - architecture / module boundaries / Dexie schema → `context/architecture.md` - code contracts or standards → `context/code-standards.md` - feature scope → `context/project-overview.md` - visual design decisions → `context/ui-context.md` - progress, next steps, decisions → `context/progress-tracker.md`
      (and a new entry in `context/adr-log.md` for architecture decisions)

Additional expectations from `code-standards.md` §8:

- **Keep PRs small** — max ~400 changed lines per PR.
- **One approval** is required before merge.
- **New parsers** go in a dedicated PR, together with their fixture and tests.
- Keep architectural layers separate in a change — don't mix a parser change
  and a theme change in one PR (`ai-workflow-rules.md` §2).

---

## 6. Good First Issues

Looking for a place to start? Check issues labeled
**`good first issue`** on GitHub.

> **Note for maintainers:** this placeholder will be updated once the label is
> created and applied on GitHub.

Good starting points are typically: documentation fixes, UI polish that already
has an approved spec, and test coverage additions. For anything touching a
platform parser, read §2 above first — and if you don't have a real export,
open a New Platform Support issue rather than guessing.

---

**Questions?** Use [GitHub Discussions](https://github.com/codingmodern/offline-ai-conversation-viewer/discussions) — not the issue
tracker.
