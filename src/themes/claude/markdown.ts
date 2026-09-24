import { Marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Renders Claude message content from Markdown to sanitized HTML
 * (`ui-context.md` §4.4).
 *
 * A deliberate duplicate of the DeepSeek theme's `markdown.ts`
 * (`ai-workflow-rules.md` §12 — themes never import across theme folders), with
 * the identical hardened pipeline: `marked` parses CommonMark + GFM (tables,
 * task lists, autolinks) with single newlines turned into `<br>`, then
 * `DOMPurify` strips any tag, attribute, or URL scheme that survived parsing.
 * Every link is forced through a `noopener noreferrer` shell so the document
 * never follows a target the export author injected.
 *
 * Claude's replies are Markdown-heavy (headings, lists, tables, fenced code),
 * so the same render scope as DeepSeek covers the real corpus. The output is
 * styled entirely by `--claude-*` tokens in `ClaudeMessage.module.css` — no new
 * tokens. The `Copy` button keeps copying the *raw* `UnifiedMessage.content`;
 * only rendering goes through this helper.
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
