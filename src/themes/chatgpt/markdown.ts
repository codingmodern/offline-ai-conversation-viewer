import { Marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Renders ChatGPT message content from Markdown to sanitized HTML (11b FR‑3). A
 * copy‑and‑restyle of Claude's `markdown.ts` onto the `--chatgpt-*` tokens —
 * themes never import across theme folders. Identical hardened pipeline:
 * `marked` parses CommonMark + GFM with single newlines as `<br>`, then
 * `DOMPurify` strips any surviving tag/attribute/scheme; every link is forced
 * through a `noopener noreferrer` shell. The output is styled entirely by
 * `--chatgpt-*` tokens; the Copy button keeps copying the raw content.
 */
const markdownParser = new Marked({ gfm: true, breaks: true, async: false });

const SANITIZE_CONFIG = {
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
  const rawHtml = markdownParser.parse(text) as string;
  return DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG);
}
