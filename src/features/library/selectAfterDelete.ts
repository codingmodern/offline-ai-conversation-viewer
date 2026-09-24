/**
 * Chooses which conversation becomes active after a delete (Decision 2 / ADR #10).
 *
 * **Rule:** prefer the *next* entry in the current Sidebar order, fall back to the
 * *previous* one, and return `undefined` when the library is now empty — which the
 * caller renders as the Empty State (spec → Edge Cases).
 *
 * Kept as a pure function over ids (not entries, not React state) so the rule can
 * be tested exhaustively without a database or a render, and so `useLibrary` holds
 * no branching logic of its own.
 *
 * Deleting a conversation that is *not* the active one must not move the
 * selection — that is the caller's check, and this function is only asked about
 * the active case.
 */
export function selectAfterDelete(
  /** Ids in the order the Sidebar displays them, **before** the delete. */
  orderedIds: readonly number[],
  deletedId: number,
): number | undefined {
  const index = orderedIds.indexOf(deletedId);
  if (index === -1) {
    // The deleted id was not in the list: nothing to reassign from.
    return undefined;
  }

  // "Next" is the entry that visually takes the deleted row's place, so the
  // selection appears to stay put rather than jumping upwards.
  const next = orderedIds[index + 1];
  if (next !== undefined) {
    return next;
  }

  // The last row was deleted, so there is no "next"; step back instead.
  return orderedIds[index - 1];
}
