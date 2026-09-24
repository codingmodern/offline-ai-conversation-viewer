import { useState } from 'react';
import type { JSX } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ProviderId } from '@/types/providers';
import type { ResolvedMetadataField } from '@/features/library/metadataFields';
import { PlatformIcon } from '@/components/import/PlatformIcons';
import { PLATFORM_LABEL } from './platformLabels';
import styles from './MetadataPanel.module.css';

interface MetadataPanelProps {
  /**
   * Present fields only, already resolved through the descriptor list
   * (`features/library/metadataFields.ts`). The component itself knows nothing
   * about which fields exist — adding a future field needs no change here
   * (FR3/NFR2).
   */
  readonly fields: readonly ResolvedMetadataField[];
  /**
   * Always shown, even as 0 — an empty conversation is valid, not an error
   * (FR2). Rendered unconditionally rather than as a descriptor entry for that
   * reason.
   */
  readonly messageCount: number;
  /** Platform of the stored record; named, never themed (Unit 04 FR10). */
  readonly platform: ProviderId;
}

/**
 * Detailed conversation-level metadata view (`05-conversation-metadata.md`,
 * `ui-context.md` §3 → Metadata Panel).
 *
 * Display only: this unit generates, guesses and derives nothing (FR6). Absent
 * fields simply do not arrive in `fields`, so they are never rendered with a
 * placeholder or a blank row (FR4); the platform name and the message count are
 * the two facts that always exist for a stored record.
 *
 * A definition list (`<dl>`) gives screen readers label/value pairing without
 * extra ARIA, and the section's accessible name lets tests target this panel
 * specifically inside the shell.
 *
 * Post-Unit-06 refinement (ADR #20):
 *  - the entire panel is collapsible, **collapsed by default**, so the row
 *    shell stays compact. The toggle is the heading itself (mirrors
 *    `ThinkingBlock`), with `aria-expanded` / `aria-controls` for AT;
 *  - the platform row now shows the brand mark reused from
 *    `import/PlatformIcons.tsx` (the same SVG set Unit 08's picker uses) at a
 *    medium size next to the platform name. The icon is purely
 *    presentational (`aria-hidden` on the SVG), so the existing label remains
 *    the accessible name. `ProviderId` is structurally compatible with the
 *    icon map's id union — currently always `'deepseek'`, but no extra
 *    branch is needed when new providers land.
 */
export function MetadataPanel({
  fields,
  messageCount,
  platform,
}: MetadataPanelProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const listId = 'metadata-panel-list';

  return (
    <section className={styles.panel} aria-label="اطلاعات مکالمه">
      <h3 className={styles.heading}>
        <button
          type="button"
          className={styles.headingButton}
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={(): void => {
            setExpanded((value) => !value);
          }}
        >
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={expanded ? styles.chevronOpen : styles.chevron}
          />
          اطلاعات مکالمه
        </button>
      </h3>
      {expanded && (
        <dl className={styles.list} id={listId}>
          <div className={styles.row} data-field="platform">
            <dt className={styles.label}>پلتفرم</dt>
            <dd className={styles.value}>
              <span className={styles.platform}>
                <PlatformIcon id={platform} size={20} />
                {PLATFORM_LABEL[platform]}
              </span>
            </dd>
          </div>
          {fields.map((field) => (
            <div className={styles.row} key={field.key} data-field={field.key}>
              <dt className={styles.label}>{field.label}</dt>
              <dd className={styles.value}>{field.value}</dd>
            </div>
          ))}
          <div className={styles.row}>
            <dt className={styles.label}>تعداد پیام‌ها</dt>
            <dd className={styles.value}>{messageCount}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
