import DOMPurify from 'dompurify';

/**
 * Gemini answer rendering helpers (`ui-context.md` §4.5).
 *
 * Gemini is the one platform whose export ships **pre-rendered HTML** in
 * `safeHtmlItem[].html` instead of Markdown, so there is no `marked` step here
 * at all: the answer is sanitized and injected as-is (FR7, ADR #24's rendering
 * half, `architecture.md` → Gemini Import & Rendering Rules).
 *
 * Why sanitation lives in the theme: this HTML is untrusted third-party input
 * (NFR2 — Gemini's own markup, copied into an export by a tool we do not
 * control), and it may only be rendered after DOMPurify has been through it
 * (Invariant #5, ADR #21). `normalization/gemini.ts` runs inside the import
 * worker, which has no DOM, so it deliberately hands the raw HTML through
 * untouched and this module — main thread, DOMPurify available — is the single
 * place it becomes DOM.
 *
 * A deliberate near-duplicate of the Claude/DeepSeek themes' `markdown.ts`
 * pipeline, minus the Markdown half (`ai-workflow-rules.md` §12 — themes never
 * import across theme folders), with one difference that matters: the *input*
 * is already HTML, so the allow-list is what stands between the export and the
 * document instead of being a second wall behind an escaping renderer.
 */

/**
 * Only tags the census of the real export attests are allowed — `p`, `strong`,
 * `em`, `ul`, `ol`, `li`, `h3`, `h4`, `pre`, `code`, `hr`, `a`, `blockquote` —
 * plus two guarded additions:
 *
 *  - `br`, whose removal would silently merge two lines into one (a plain
 *    newline primitive, not new semantics);
 *  - `h1`/`h2`/`h5`/`h6`, the same generator's other heading levels, so a
 *    heading never loses its hierarchy if an export emits another level.
 *
 * Everything else degrades: DOMPurify drops the element and keeps its text, so
 * an unattested construct loses its formatting instead of its content.
 * `img`/`iframe`/`script`/`style` can never survive, and neither can `src`:
 * this app is offline and makes no network request of any kind (Invariant #1),
 * and the export carries no binaries anyway — attachments render as name-only
 * placeholders (FR8). No `style`/`class` attribute is allowed either, so the
 * export cannot restyle the app.
 */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'a',
    'p',
    'br',
    'strong',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'hr',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

DOMPurify.addHook('afterSanitizeAttributes', (node): void => {
  if (node instanceof HTMLAnchorElement) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** One run of a sanitized answer: HTML to inject, or a code block to render. */
export interface HtmlSegment {
  /**
   * `code` for a top-level `<pre>` (rendered as a real element with its own
   * Copy affordance — §4.5 asks for a Copy bar on short code blocks), `html`
   * for every other run, which is injected as sanitized HTML.
   */
  readonly kind: 'html' | 'code';
  /** Sanitized HTML, or the code block's own text. */
  readonly value: string;
}

/** Sanitizes one answer draft for rendering. */
export function sanitizeMessageHtml(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

/**
 * Splits a **sanitized** answer into HTML runs and code blocks.
 *
 * Gemini's code blocks arrive as top-level `<pre><code>…</code></pre>` siblings
 * (census: 9 of them across the real export), the same way Claude's fenced
 * blocks do — so the theme can give them a Copy bar and a code surface without
 * asking DOMPurify for anything new.
 *
 * Why the split is done on the DOM instead of the string: re-serialising text
 * nodes by hand would lose the escaping DOMPurify applied (a `&lt;script&gt;`
 * in the answer's *text* must stay escaped). Nodes are therefore moved into a
 * detached holder and read back with `innerHTML`, which escapes exactly like
 * DOMPurify does. The holder is never attached to the document, so nothing in
 * this pass can run or load anything.
 *
 * A `<pre>` nested deeper than the top level (e.g. inside a list item) stays
 * inside its HTML run and is styled by `.assistantText pre` — the same graceful
 * degradation the theme applies to any unattested construct.
 *
 * Must only be called with the output of `sanitizeMessageHtml`.
 */
export function splitCodeBlocks(sanitizedHtml: string): readonly HtmlSegment[] {
  const template = document.createElement('template');
  template.innerHTML = sanitizedHtml;

  const segments: HtmlSegment[] = [];
  let pending: Node[] = [];

  const flush = (): void => {
    if (pending.length === 0) {
      return;
    }
    const holder = document.createElement('div');
    for (const node of pending) {
      holder.append(node);
    }
    segments.push({ kind: 'html', value: holder.innerHTML });
    pending = [];
  };

  for (const node of Array.from(template.content.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'PRE') {
      flush();
      segments.push({ kind: 'code', value: node.textContent ?? '' });
      continue;
    }
    pending.push(node);
  }
  flush();

  return segments;
}

/**
 * The visible text of a sanitized answer — what the message's Copy button
 * puts on the clipboard.
 *
 * Copying the export's raw HTML would hand the user markup they never saw, so
 * the theme copies what is on screen instead. This is a *presentation* value
 * only: `UnifiedMessage.content` keeps the verbatim HTML (ADR #8) and nothing
 * else ever reads this.
 *
 * Block boundaries become newlines so paragraphs, list items and code blocks
 * paste as separate lines rather than one run-on string; entities DOMPurify
 * escaped are decoded by reading `textContent` of the parsed fragment.
 */
export function toPlainText(sanitizedHtml: string): string {
  const holder = document.createElement('div');
  holder.innerHTML = sanitizedHtml;

  const blocks = holder.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, hr');
  for (const block of blocks) {
    block.after('\n');
  }

  return (holder.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}