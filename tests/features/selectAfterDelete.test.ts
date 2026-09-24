import { describe, expect, it } from 'vitest';
import { selectAfterDelete } from '@/features/library/selectAfterDelete';

/**
 * Post-delete selection (Decision 2 / ADR #10).
 *
 * A pure function over ids, tested without a database or a DOM: "which row becomes
 * active" is a policy decision, so it is verified directly rather than inferred
 * from rendered output.
 */

/** Ids in Sidebar order (newest import first), before the delete. */
const orderedIds = [1, 2, 3];

describe('selectAfterDelete', () => {
  it('prefers the next conversation in sidebar order', () => {
    // Deleting the middle row: the list closes downward, so the row that visually
    // takes the deleted one's place becomes active.
    expect(selectAfterDelete(orderedIds, 2)).toBe(3);
  });

  it('falls back to the previous conversation when the last one is deleted', () => {
    expect(selectAfterDelete(orderedIds, 3)).toBe(2);
  });

  it('selects the next one when the first is deleted', () => {
    expect(selectAfterDelete(orderedIds, 1)).toBe(2);
  });

  it('returns undefined when the deleted conversation was the only one', () => {
    // `undefined` is what routes the shell to the Empty State (Decision 2).
    expect(selectAfterDelete([7], 7)).toBeUndefined();
  });

  it('returns undefined for an already empty list', () => {
    expect(selectAfterDelete([], 1)).toBeUndefined();
  });

  it('returns undefined when the id is not in the list', () => {
    // Guards against a stale id, e.g. after another tab removed the record.
    expect(selectAfterDelete(orderedIds, 99)).toBeUndefined();
  });

  it('picks a neighbour by list position, not by numeric id', () => {
    // Import order — hence display order — need not match ascending ids.
    expect(selectAfterDelete([5, 2, 9], 2)).toBe(9);
  });

  it('steps back to the previous id when deleting the tail of an unordered list', () => {
    expect(selectAfterDelete([5, 2, 9], 9)).toBe(2);
  });
});
