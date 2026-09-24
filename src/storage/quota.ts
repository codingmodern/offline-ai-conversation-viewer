/**
 * Proactive storage-quota check (`architecture.md` §5 → Security → Storage Quota,
 * spec → Edge Cases: "warn before the real storage error").
 *
 * Decision 3: usage is read from `navigator.storage.estimate()` and the user is
 * warned once usage crosses 90% of the estimated quota. Where the API is missing,
 * the proactive warning is simply skipped — the app then relies on graceful
 * handling of the *actual* quota error, which `conversationStore.saveConversation`
 * reports as `StorageQuotaError` while leaving the library untouched (FR2).
 *
 * This is intentionally advisory, not a gate: the estimate is approximate in every
 * browser, so blocking a write on it could refuse an import that would have
 * succeeded.
 */

/** Fraction of the estimated quota at which the user is warned. */
export const QUOTA_WARNING_THRESHOLD = 0.9;

/** Outcome of a quota check. `supported: false` means "no estimate available". */
export type QuotaStatus =
  | { readonly supported: false }
  | {
      readonly supported: true;
      readonly usage: number;
      readonly quota: number;
      /** `usage / quota`, clamped to a finite number. */
      readonly usedRatio: number;
      /** True once `usedRatio` reaches `QUOTA_WARNING_THRESHOLD`. */
      readonly nearLimit: boolean;
    };

/**
 * Estimates how full the origin's storage is.
 *
 * Never throws and never returns a `StorageResult`: a failed *estimate* is not a
 * storage failure the user should hear about, it just means no warning can be
 * shown. Any error therefore degrades to `{ supported: false }`.
 */
export async function checkStorageQuota(): Promise<QuotaStatus> {
  // Feature-detected rather than assumed: `navigator.storage` is absent in some
  // browsers and in jsdom, and `estimate` is absent in a few that do have
  // `storage`.
  const storage: StorageManager | undefined = globalThis.navigator?.storage;
  if (typeof storage?.estimate !== 'function') {
    return { supported: false };
  }

  try {
    const { usage, quota } = await storage.estimate();

    // Both fields are optional in the spec, and a zero quota would make the
    // ratio meaningless (division by zero), so treat either as "no estimate".
    if (typeof usage !== 'number' || typeof quota !== 'number' || quota <= 0) {
      return { supported: false };
    }

    const usedRatio = usage / quota;

    return {
      supported: true,
      usage,
      quota,
      usedRatio,
      nearLimit: usedRatio >= QUOTA_WARNING_THRESHOLD,
    };
  } catch (error) {
    // Console-only: the user gains nothing from a failed estimate
    // (`code-standards.md` §5).
    console.error('[storage] Quota estimate failed.', error);
    return { supported: false };
  }
}
