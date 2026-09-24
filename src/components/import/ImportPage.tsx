import type { JSX } from 'react';
import type { UnifiedConversation } from '@/types/conversation';
import { GuidedImportFlow } from '@/components/import/GuidedImportFlow';
import styles from './ImportPage.module.css';

interface ImportPageProps {
  /**
   * Receives the confirmed batch's conversations so they can be stored (Unit 04).
   * Optional so this screen still stands alone — the flow runs without a library.
   */
  readonly onImported?: (conversations: readonly UnifiedConversation[]) => void;
  /**
   * Leaves the import screen without importing. Optional, because there is not
   * always somewhere to go back to (an empty library has no conversation to
   * return to), and because this screen must still stand alone.
   */
  readonly onCancel?: () => void;
}

/**
 * Import screen: the only entry point for data into the app.
 *
 * Thin presentational shell — the three-step guided flow (Unit 08) owns the
 * interaction; the platform choice never steers detection (`02-platform-detection.md`
 * FR9 / Invariant #4) and parsing shows no separate progress of its own.
 */
export function ImportPage({ onImported, onCancel }: ImportPageProps = {}): JSX.Element {
  return (
    <main className={styles.page}>
      {onCancel !== undefined && (
        <button type="button" className={styles.back} onClick={onCancel}>
          بازگشت به کتابخانه
        </button>
      )}
      <h1 className={styles.heading}>ورود فایل گفتگو</h1>
      <p className={styles.subheading}>
        همهی پردازشها روی همین دستگاه انجام میشود و هیچ دادهای به اینترنت ارسال نمیشود.
      </p>

      <GuidedImportFlow onConfirm={onImported} />
    </main>
  );
}