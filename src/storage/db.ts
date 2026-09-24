import Dexie, { type EntityTable } from 'dexie';
import type { StoredConversation } from '@/types/storage';

/**
 * The Dexie database definition — the **only** place in the project that
 * declares an IndexedDB schema (`architecture.md` §2 → `storage/`, FR3).
 *
 * Nothing outside `storage/` may import this module: components and features go
 * through `conversationStore.ts`, so the persistence technology stays swappable
 * and no UI code can bypass validation or transactions.
 */

export const DATABASE_NAME = 'offline-ai-conversation-viewer';

/** Current schema version. Bumping it requires a Dexie `.upgrade()` step. */
export const SCHEMA_VERSION = 1;

export class LibraryDatabase extends Dexie {
  /**
   * `EntityTable` types the primary key as auto-generated, so callers add
   * records without `id` and read them back with one.
   */
  declare conversations: EntityTable<StoredConversation, 'id'>;

  constructor(name: string = DATABASE_NAME) {
    super(name);

    /*
     * Index choices (FR1):
     * - `++id`            surrogate auto-increment PK. Kept even though ADR #13
     *                     removed the last flow that wrote two records sharing a
     *                     natural key: libraries created under ADR #9's "Add
     *                     anyway" policy may still hold twin-keyed rows, so the
                     schema stays put rather than forcing a migration.
     * - `platform`        query helper for per-platform lookups.
     * - `importedAt`      the Sidebar's sort key; indexed so ordering is done by
     *                     IndexedDB rather than by loading every record.
     * - `[platform+sourceConversationId]`
     *                     compound index backing duplicate detection. Deliberately
     *                     **not** `&` (unique): uniqueness would make the engine —
     *                     not the storage layer's own rule (FR8) — reject writes,
     *                     and legacy libraries may already contain duplicate pairs
     *                     (see above).
     *
     * Only indexed properties are listed here; `conversation` is stored but not
     * indexed, which is what keeps large exports cheap to write.
     */
    this.version(SCHEMA_VERSION).stores({
      conversations: '++id, platform, importedAt, [platform+sourceConversationId]',
    });
  }
}

/**
 * The single shared database instance.
 *
 * One instance per page keeps Dexie's connection and its `liveQuery` change
 * notifications consistent; a second instance would open a second connection and
 * could block schema upgrades.
 */
export const db = new LibraryDatabase();
