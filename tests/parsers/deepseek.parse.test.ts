import { describe, expect, it } from 'vitest';
import { parse } from '@/parsers/deepseek/parse';
import sampleReal from '../fixtures/deepseek/sample-real.json';
import sampleRich from '../fixtures/deepseek/sample-rich.json';

/** Wraps arbitrary fragments in the smallest valid export around them. */
function exportWithFragments(fragments: readonly unknown[]): unknown {
  return [
    {
      id: 'c1',
      mapping: {
        root: { id: 'root', parent: null, children: ['1'], message: null },
        '1': { id: '1', parent: 'root', children: [], message: { fragments } },
      },
    },
  ];
}

/** Minimal valid export: one conversation, one REQUEST fragment. */
function minimalExport(nodeOverrides: Record<string, unknown> = {}): unknown {
  return [
    {
      id: 'c1',
      title: 'Sample',
      mapping: {
        root: { id: 'root', parent: null, children: ['1'], message: null },
        '1': {
          id: '1',
          parent: 'root',
          children: [],
          message: { fragments: [{ type: 'REQUEST', content: 'hi' }] },
          ...nodeOverrides,
        },
      },
    },
  ];
}

describe('deepseek parse — real fixture', () => {
  it('reads both conversations of the real anonymized export', () => {
    const result = parse(sampleReal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.providerId).toBe('deepseek');
    expect(result.data.conversations).toHaveLength(2);
  });

  it('keeps conversation metadata verbatim (no date parsing, no defaults)', () => {
    const result = parse(sampleReal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [first] = result.data.conversations;
    expect(first).toMatchObject({
      id: 'df49e9d2-f751-4feb-9ee8-3706dd5bb27f',
      title: 'Sample conversation 1',
      insertedAt: '2026-08-20T23:23:45.861000+08:00',
      updatedAt: '2026-08-20T23:25:55.182000+08:00',
    });
  });

  it('flattens the mapping graph into REQUEST/RESPONSE reading order', () => {
    const result = parse(sampleReal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [first, second] = result.data.conversations;
    // Graph order, not timestamp order: each RESPONSE is stamped *before* its
    // REQUEST in this export, so a timestamp sort would invert every pair.
    expect(first?.fragments.map((fragment) => fragment.type)).toEqual([
      'REQUEST',
      'RESPONSE',
      'REQUEST',
      'RESPONSE',
      'REQUEST',
      'RESPONSE',
    ]);
    expect(second?.fragments.map((fragment) => fragment.type)).toEqual(['REQUEST', 'RESPONSE']);
  });

  it('skips the structural root node instead of emitting an empty message', () => {
    const result = parse(sampleReal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 6 real nodes + `root`, but `root` carries `message: null`.
    expect(result.data.conversations[0]?.fragments).toHaveLength(6);
  });

  it('carries the per-message model and timestamp onto each fragment', () => {
    const result = parse(sampleReal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations[0]?.fragments[0]).toEqual({
      type: 'REQUEST',
      category: 'text',
      turnIndex: 0,
      content: 'Sample message content',
      model: 'deepseek-chat',
      insertedAt: '2026-08-20T23:24:36.688000+08:00',
    });
  });

  it('never produces UnifiedConversation fields (parse stays structural)', () => {
    const result = parse(sampleReal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [first] = result.data.conversations;
    // FR1: shaping into the unified model belongs to `normalization/` alone.
    expect(first).not.toHaveProperty('messages');
    expect(first).not.toHaveProperty('sourceProvider');
    expect(first?.fragments[0]).not.toHaveProperty('role');
  });
});

describe('deepseek parse — ordering and branches', () => {
  it('follows children depth-first rather than object key order', () => {
    // Keys are deliberately declared out of order; only `children` is trusted.
    const data = [
      {
        id: 'c1',
        mapping: {
          '2': {
            children: [],
            message: { fragments: [{ type: 'RESPONSE', content: 'second' }] },
          },
          root: { children: ['1'], message: null },
          '1': {
            children: ['2'],
            message: { fragments: [{ type: 'REQUEST', content: 'first' }] },
          },
        },
      },
    ];

    const result = parse(data);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations[0]?.fragments.map((f) => f.content)).toEqual([
      'first',
      'second',
    ]);
  });

  it('keeps every branch of a regenerated answer instead of dropping one', () => {
    const data = [
      {
        id: 'c1',
        mapping: {
          root: { children: ['1'], message: null },
          '1': {
            children: ['2a', '2b'],
            message: { fragments: [{ type: 'REQUEST', content: 'q' }] },
          },
          '2a': { children: [], message: { fragments: [{ type: 'RESPONSE', content: 'a1' }] } },
          '2b': { children: [], message: { fragments: [{ type: 'RESPONSE', content: 'a2' }] } },
        },
      },
    ];

    const result = parse(data);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations[0]?.fragments.map((f) => f.content)).toEqual([
      'q',
      'a1',
      'a2',
    ]);
  });

  it('preserves all parts of a multi-fragment message in order', () => {
    const data = minimalExport({
      message: {
        fragments: [
          { type: 'RESPONSE', content: 'part one' },
          { type: 'RESPONSE', content: 'part two' },
        ],
      },
    });

    const result = parse(data);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations[0]?.fragments.map((f) => f.content)).toEqual([
      'part one',
      'part two',
    ]);
  });

  it('terminates on a cyclic mapping without duplicating messages', () => {
    const data = [
      {
        id: 'c1',
        mapping: {
          root: { children: ['1'], message: null },
          '1': {
            children: ['2'],
            message: { fragments: [{ type: 'REQUEST', content: 'q' }] },
          },
          // Points back at its parent — a malformed export must not hang.
          '2': { children: ['1'], message: { fragments: [{ type: 'RESPONSE', content: 'a' }] } },
        },
      },
    ];

    const result = parse(data);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations[0]?.fragments.map((f) => f.content)).toEqual(['q', 'a']);
  });

  it('ignores a dangling child id (no node, so no message to lose)', () => {
    const data = [
      {
        id: 'c1',
        mapping: {
          root: { children: ['1', 'missing'], message: null },
          '1': { children: [], message: { fragments: [{ type: 'REQUEST', content: 'q' }] } },
        },
      },
    ];

    const result = parse(data);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations[0]?.fragments).toHaveLength(1);
  });

  it('accepts a conversation whose mapping holds only the root node', () => {
    // An empty-but-well-formed conversation is not a parse failure.
    const result = parse([{ id: 'c1', mapping: { root: { children: [], message: null } } }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations[0]?.fragments).toEqual([]);
  });

  it('omits absent optional metadata rather than setting it to undefined', () => {
    const result = parse([
      {
        id: 'c1',
        mapping: {
          root: { children: ['1'], message: null },
          '1': { children: [], message: { fragments: [{ type: 'REQUEST', content: 'q' }] } },
        },
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [first] = result.data.conversations;
    expect(first).not.toHaveProperty('title');
    expect(first).not.toHaveProperty('insertedAt');
    expect(first?.fragments[0]).not.toHaveProperty('model');
  });
});

describe('deepseek parse — typed failures', () => {
  it.each([
    ['a bare object', { id: 'c1' }],
    ['null', null],
    ['a string', 'deepseek'],
    ['a number', 42],
  ])('reports UnexpectedTypeError for %s at the root', (_label, payload) => {
    const result = parse(payload);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UnexpectedTypeError');
  });

  it('reports MissingFieldError for an export with no conversations', () => {
    const result = parse([]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MissingFieldError');
  });

  it('reports MissingFieldError when the conversation id is absent', () => {
    const result = parse([{ mapping: { root: { children: [], message: null } } }]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MissingFieldError');
    expect(result.error.detail).toContain('id');
  });

  it('reports UnexpectedTypeError when the conversation id is not a string', () => {
    const result = parse([{ id: 7, mapping: { root: { children: [], message: null } } }]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UnexpectedTypeError');
  });

  it('reports MissingFieldError when mapping is absent', () => {
    const result = parse([{ id: 'c1', title: 'Sample' }]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MissingFieldError');
    expect(result.error.detail).toContain('mapping');
  });

  it('reports MissingFieldError when mapping has no reachable starting node', () => {
    // Every node is another node's child, so the graph is a pure cycle with no
    // entry point — genuinely unreadable, unlike a merely absent `root` key.
    const result = parse([
      {
        id: 'c1',
        mapping: {
          '1': { children: ['2'], message: { fragments: [{ type: 'REQUEST', content: 'q' }] } },
          '2': { children: ['1'], message: { fragments: [{ type: 'RESPONSE', content: 'a' }] } },
        },
      },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MissingFieldError');
    expect(result.error.detail).toContain('root');
  });

  it('reports MissingFieldError for an empty mapping', () => {
    const result = parse([{ id: 'c1', mapping: {} }]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MissingFieldError');
  });

  it('reports MissingFieldError when a message has no fragments array', () => {
    const result = parse([
      {
        id: 'c1',
        mapping: {
          root: { children: ['1'], message: null },
          '1': { children: [], message: { model: 'deepseek-chat' } },
        },
      },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MissingFieldError');
    expect(result.error.detail).toContain('fragments');
  });

  it('reports UnexpectedTypeError when fragment content is not a string', () => {
    const result = parse(
      minimalExport({ message: { fragments: [{ type: 'REQUEST', content: 42 }] } }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UnexpectedTypeError');
    expect(result.error.detail).toContain('content');
  });

  it('reports MissingFieldError when a fragment has no type', () => {
    const result = parse(minimalExport({ message: { fragments: [{ content: 'hi' }] } }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MissingFieldError');
    expect(result.error.detail).toContain('type');
  });

  it('reports UnexpectedTypeError when a present title has the wrong type', () => {
    // Absent optional fields are fine; a *wrong-typed* one means format drift.
    const result = parse([
      { id: 'c1', title: 5, mapping: { root: { children: [], message: null } } },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UnexpectedTypeError');
    expect(result.error.detail).toContain('title');
  });

  it('reports UnexpectedTypeError when children is not an array', () => {
    const result = parse([{ id: 'c1', mapping: { root: { children: 'nope', message: null } } }]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UnexpectedTypeError');
    expect(result.error.detail).toContain('children');
  });

  it('fails the whole export when any single conversation is malformed', () => {
    // A partially readable export would hide missing messages silently.
    const result = parse([
      { id: 'c1', mapping: { root: { children: [], message: null } } },
      { title: 'no id' },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail).toContain('conversations[1]');
  });

  it('never throws, whatever the input', () => {
    const hostile: unknown[] = [{ id: 'c1', mapping: { root: { children: [{}], message: null } } }];

    expect(() => parse(hostile)).not.toThrow();
    expect(() => parse(undefined)).not.toThrow();
    expect(() => parse(Number.NaN)).not.toThrow();
  });
});

/**
 * One case per payload category. A real export carries 8 fragment types, only 3
 * of which hold `content` — the assumption that broke real imports.
 */
describe('deepseek parse — fragment payload categories', () => {
  it.each([
    ['REQUEST', 'text'],
    ['RESPONSE', 'text'],
    ['THINK', 'text'],
  ])('classifies %s as a text fragment carrying content', (type, category) => {
    const result = parse(exportWithFragments([{ type, content: 'body' }]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations[0]?.fragments[0]).toMatchObject({
      type,
      category,
      content: 'body',
    });
  });

  it('classifies FILE as an attachment and maps every file entry', () => {
    const result = parse(
      exportWithFragments([
        {
          type: 'FILE',
          files: [
            { file_id: 'f-1', file_name: 'placeholder-a.pdf', file_size: 10 },
            { file_id: 'f-2', file_name: 'placeholder-b.png', file_size: 20 },
          ],
        },
      ]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [fragment] = result.data.conversations[0]?.fragments ?? [];
    expect(fragment?.category).toBe('attachment');
    // All entries are read — nothing proves a fragment carries exactly one file.
    expect(fragment?.files).toEqual([
      { fileId: 'f-1', fileName: 'placeholder-a.pdf', fileSize: 10 },
      { fileId: 'f-2', fileName: 'placeholder-b.png', fileSize: 20 },
    ]);
    // A FILE fragment has no `content`, and that is not a failure.
    expect(fragment).not.toHaveProperty('content');
  });

  it.each(['SEARCH', 'TOOL_SEARCH'])(
    'classifies %s as tool activity and passes `results` through unmodified',
    (type) => {
      const results = [{ title: 'Placeholder result', url: 'https://example.invalid/a' }];

      const result = parse(exportWithFragments([{ type, results }]));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const [fragment] = result.data.conversations[0]?.fragments ?? [];
      expect(fragment?.category).toBe('toolActivity');
      // Verbatim: `parse()` must not reshape or interpret the payload (FR1).
      expect(fragment?.results).toEqual(results);
    },
  );

  it.each(['TOOL_OPEN', 'TOOL_FIND'])(
    'accepts %s with no payload at all and invents no `results`',
    (type) => {
      const result = parse(exportWithFragments([{ type }]));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const [fragment] = result.data.conversations[0]?.fragments ?? [];
      expect(fragment?.category).toBe('toolActivity');
      expect(fragment).not.toHaveProperty('results');
      expect(fragment).not.toHaveProperty('content');
    },
  );

  it('groups fragments of one node into the same turn', () => {
    const result = parse(
      exportWithFragments([
        { type: 'FILE', files: [{ file_id: 'f-1', file_name: 'a.pdf', file_size: 1 }] },
        { type: 'REQUEST', content: 'q' },
      ]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Same message → same turn, so an attachment can be traced to its sender.
    expect(result.data.conversations[0]?.fragments.map((f) => f.turnIndex)).toEqual([0, 0]);
  });

  it('numbers turns across nodes without counting structural ones', () => {
    const result = parse(sampleRich);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `root` carries no message, so the first real node is still turn 0.
    expect(result.data.conversations[0]?.fragments.map((f) => f.turnIndex)).toEqual([
      0, 0, 1, 1, 2, 3, 3, 3, 3, 3, 3, 4,
    ]);
  });

  it('still requires content for a text fragment', () => {
    // The per-category rule loosens `content` only where it does not belong.
    const result = parse(exportWithFragments([{ type: 'RESPONSE' }]));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MissingFieldError');
    expect(result.error.detail).toContain('content');
  });

  it('reports MissingFieldError when an attachment fragment has no files', () => {
    const result = parse(exportWithFragments([{ type: 'FILE' }]));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MissingFieldError');
    expect(result.error.detail).toContain('files');
  });

  it.each([
    ['file_id', { file_name: 'a.pdf', file_size: 1 }],
    ['file_name', { file_id: 'f-1', file_size: 1 }],
    ['file_size', { file_id: 'f-1', file_name: 'a.pdf' }],
  ])('reports MissingFieldError when a file entry lacks %s', (missing, file) => {
    // Better a clear failure than an attachment shown with a fabricated value.
    const result = parse(exportWithFragments([{ type: 'FILE', files: [file] }]));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MissingFieldError');
    expect(result.error.detail).toContain(missing);
  });

  it('reports UnexpectedTypeError when file_size is not a number', () => {
    const result = parse(
      exportWithFragments([
        { type: 'FILE', files: [{ file_id: 'f-1', file_name: 'a.pdf', file_size: '1 KB' }] },
      ]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UnexpectedTypeError');
    expect(result.error.detail).toContain('file_size');
  });

  it('preserves an unrecognised fragment type instead of rejecting the file', () => {
    // A type added by a future export version must not block the import.
    const result = parse(exportWithFragments([{ type: 'BRAND_NEW_TYPE' }]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [fragment] = result.data.conversations[0]?.fragments ?? [];
    expect(fragment?.type).toBe('BRAND_NEW_TYPE');
    expect(fragment?.category).toBe('text');
    expect(fragment).not.toHaveProperty('content');
  });

  it('reads the rich fixture end to end, covering all eight attested types', () => {
    const result = parse(sampleRich);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations[0]?.fragments.map((f) => f.type)).toEqual([
      'FILE',
      'REQUEST',
      'THINK',
      'RESPONSE',
      'REQUEST',
      'SEARCH',
      'TOOL_SEARCH',
      'TOOL_OPEN',
      'TOOL_FIND',
      'THINK',
      'RESPONSE',
      'FILE',
    ]);
  });
});

/**
 * Regression: the shapes that made a real DeepSeek export (2026-08-20) fail with
 * `MissingFieldError` when `content` was treated as critical for every fragment.
 *
 * Values are placeholders — the structure is what reproduces the bug.
 */
describe('deepseek parse — regression: non-text fragments blocked real imports', () => {
  it('imports a conversation whose fragments carry files, results or nothing', () => {
    const result = parse([
      {
        id: 'regression-1',
        title: 'Placeholder title',
        mapping: {
          root: { id: 'root', parent: null, children: ['1'], message: null },
          '1': {
            id: '1',
            parent: 'root',
            children: ['2'],
            message: {
              model: 'deepseek-chat',
              inserted_at: '2026-08-20T23:24:36.688000+08:00',
              fragments: [
                {
                  type: 'FILE',
                  files: [
                    {
                      file_id: 'file-0000000000000001',
                      file_name: 'placeholder-document.pdf',
                      file_size: 12345,
                    },
                  ],
                },
                { type: 'REQUEST', content: 'Placeholder question' },
              ],
            },
          },
          '2': {
            id: '2',
            parent: '1',
            children: [],
            message: {
              model: 'deepseek-chat',
              inserted_at: '2026-08-20T23:24:36.682000+08:00',
              fragments: [
                { type: 'SEARCH', results: [{ title: 'Placeholder', url: 'https://x.invalid' }] },
                { type: 'TOOL_OPEN' },
                { type: 'THINK', content: 'Placeholder reasoning' },
                { type: 'RESPONSE', content: 'Placeholder answer' },
              ],
            },
          },
        },
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Every fragment survives: none is dropped and none fails the export.
    expect(result.data.conversations[0]?.fragments).toHaveLength(6);
  });
});
