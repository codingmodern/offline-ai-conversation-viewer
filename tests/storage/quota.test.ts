import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkStorageQuota, QUOTA_WARNING_THRESHOLD } from '@/storage/quota';

/**
 * Proactive quota check (Decision 3 / ADR #11).
 *
 * jsdom provides no `navigator.storage`, which makes it the natural place to prove
 * the unsupported-runtime path as well as the threshold arithmetic.
 */

/** Installs a fake `navigator.storage.estimate` returning the given values. */
function stubEstimate(estimate: () => Promise<StorageEstimate>): void {
  Object.defineProperty(globalThis.navigator, 'storage', {
    value: { estimate },
    configurable: true,
  });
}

/** Removes `navigator.storage` entirely, modelling a browser without the API. */
function removeStorageApi(): void {
  Object.defineProperty(globalThis.navigator, 'storage', {
    value: undefined,
    configurable: true,
  });
}

afterEach(() => {
  removeStorageApi();
});

describe('checkStorageQuota', () => {
  it('does not warn below the threshold', async () => {
    stubEstimate(async () => ({ usage: 89, quota: 100 }));

    const status = await checkStorageQuota();

    expect(status.supported && status.nearLimit).toBe(false);
  });

  it('warns exactly at the threshold', async () => {
    stubEstimate(async () => ({ usage: 90, quota: 100 }));

    const status = await checkStorageQuota();

    // Boundary is inclusive: 90% already counts as "almost full".
    expect(status.supported && status.nearLimit).toBe(true);
  });

  it('warns above the threshold and reports the ratio', async () => {
    stubEstimate(async () => ({ usage: 95, quota: 100 }));

    const status = await checkStorageQuota();

    expect(status.supported && status.nearLimit).toBe(true);
    expect(status.supported && status.usedRatio).toBeCloseTo(0.95);
  });

  it('uses a 90% threshold', () => {
    // Stated as a constant so the documented decision and the code cannot drift.
    expect(QUOTA_WARNING_THRESHOLD).toBe(0.9);
  });

  it('reports unsupported when the browser has no storage manager', async () => {
    removeStorageApi();

    const status = await checkStorageQuota();

    // No estimate → no proactive warning; the real quota error still gets handled.
    expect(status.supported).toBe(false);
  });

  it('reports unsupported when the estimate omits its numbers', async () => {
    stubEstimate(async () => ({}));

    const status = await checkStorageQuota();

    expect(status.supported).toBe(false);
  });

  it('reports unsupported rather than dividing by a zero quota', async () => {
    stubEstimate(async () => ({ usage: 0, quota: 0 }));

    const status = await checkStorageQuota();

    expect(status.supported).toBe(false);
  });

  it('degrades to unsupported when the estimate throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubEstimate(() => Promise.reject(new Error('not allowed')));

    const status = await checkStorageQuota();

    // A failed estimate is a missing warning, never a user-visible failure.
    expect(status.supported).toBe(false);
  });
});
