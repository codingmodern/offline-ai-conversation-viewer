/**
 * Splits a verbatim message body into plain-text and fenced-code segments
 * (Unit 09: Claude's replies interleave prose and ``` fences; fenced code must
 * render with the theme's code-block appearance — visual only, never executed).
 *
 * A deliberate duplicate of the DeepSeek theme's `codeFences.ts`
 * (`ai-workflow-rules.md` §12 — themes never import across theme folders).
 * Deliberately minimal: this is fence detection, not a Markdown parser. Every
 * non-fenced line stays byte-identical (`UnifiedMessage.content` is never
 * trimmed or re-formatted), and an unclosed fence keeps its content as code
 * rather than losing it.
 */

/** A run of plain message text, verbatim. */
export interface TextSegment {
  readonly type: 'text';
  readonly value: string;
}

/** One ```-fenced block; `language` is the info string when the fence carried one. */
export interface CodeSegment {
  readonly type: 'code';
  readonly value: string;
  readonly language?: string;
}

export type ContentSegment = TextSegment | CodeSegment;

/** Fence opener/closer: a line whose first non-blank characters are ``` . */
const FENCE_PATTERN = /^```(.*)$/;

/**
 * Splits `content` on ``` fences into ordered segments.
 *
 * Under `exactOptionalPropertyTypes`, `language` is *omitted* (never
 * `undefined`) when the fence carried no info string.
 */
export function splitCodeFences(content: string): readonly ContentSegment[] {
  const segments: ContentSegment[] = [];

  let textLines: string[] = [];
  let codeLines: string[] = [];
  let language: string | undefined;
  let inCode = false;

  const flushText = (): void => {
    const value = textLines.join('\n');
    // An empty run (empty input, or a file that opens with a fence) is not
    // content — emitting it would render a stray empty paragraph.
    if (value !== '') {
      segments.push({ type: 'text', value });
    }
    textLines = [];
  };

  const flushCode = (): void => {
    // A fence pair with an info string is a block even when its body is empty;
    // a bare ``` with nothing inside is not content at all.
    if (language !== undefined || codeLines.length > 0) {
      segments.push({
        type: 'code',
        value: codeLines.join('\n'),
        ...(language === undefined ? {} : { language }),
      });
    }
    codeLines = [];
    language = undefined;
  };

  for (const line of content.split('\n')) {
    const fence = FENCE_PATTERN.exec(line.trimStart());
    if (fence !== null) {
      if (inCode) {
        inCode = false;
        flushCode();
      } else {
        flushText();
        inCode = true;
        const info = fence[1]?.trim() ?? '';
        language = info === '' ? undefined : info;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
    } else {
      textLines.push(line);
    }
  }

  flushText();
  // An unclosed fence keeps its content as code — preserving beats dropping.
  if (inCode) {
    flushCode();
  }
  return segments;
}
