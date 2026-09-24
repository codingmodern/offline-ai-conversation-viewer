import { Marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Renders AI message content from Markdown to sanitized HTML
 * (post-Unit-06 refinement, ADR #20).
 *
 * Pipeline: `marked` parses CommonMark + GFM (tables, task lists, autolinks)
 * with single newlines turned into `<br>`, then `DOMPurify` strips any tag,
 * attribute, or URL scheme that survived parsing. The `architecture.md` XSS
 * row is satisfied by construction — every link is forced through a
 * `noopenner noreferrer` shell so the document never follows a target the
 * export author injected.
 *
 * Scope, per `ui-context.md` §4.6 DeepSeek Typography ("بدون سلسله‌مراتب
 * پیچیده"): inline emphasis, headings, lists, blockquotes, fenced code and
 * autolinks render. The output is styled entirely by the existing
 * `--deepseek-*` tokens in `DeepSeekMessage.module.css` — no new tokens.
 *
 * The `Copy` button keeps copying the *raw* `UnifiedMessage.content`; only
 * rendering goes through this helper (locked in by the verbatim-copy test).
 */
const markdownParser = new Marked({ gfm: true, breaks: true, async: false });

const SANITIZE_CONFIG = {
  // Defense-in-depth: marked already escapes, DOMPurify is the second wall.
  ALLOWED_TAGS: [
    'a',
    'p',
    'br',
    'strong',
    'em',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'code',
    'pre',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'del',
    'input',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'type', 'checked', 'disabled'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

DOMPurify.addHook('afterSanitizeAttributes', (node): void => {
  if (node instanceof HTMLAnchorElement) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderMarkdown(text: string): string {
  // marked.parse is async only when an async extension is registered; we
  // registered none, and forced `async: false` in the Marked constructor, so
  // the return is always a string at runtime. The cast is required because
  // the type widens the overload to `string | Promise<string>`.
  const rawHtml = markdownParser.parse(text) as string;
  return DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG);
}
