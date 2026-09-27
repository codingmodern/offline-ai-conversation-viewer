import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import type { UnifiedAttachment } from '@/types/conversation';
import styles from './AttachmentCard.module.css';

/**
 * The translator `useTranslation` hands out, derived here instead of imported
 * from `i18next`: the theme folder may only reach shared modules on the
 * isolation allow-list (11b ADR-J), and `react-i18next` is on it.
 */
type Translator = ReturnType<typeof useTranslation>['t'];

interface AttachmentCardProps {
  readonly attachments: readonly UnifiedAttachment[];
}

/**
 * Files a ChatGPT message carried (11b FR‑6). Copied from Claude's
 * `AttachmentCard` and re‑tokened — themes never import across folders.
 *
 * ChatGPT attachments arrive with a `fileId` (the `file-service://`/`file-…`
 * pointer) and a `fileName`; `fileSize` is present only on metadata
 * attachments (image pointers carry only the pointer id). So a chip shows the
 * name as‑is and the size **only when the export recorded one** — never zero
 * fabricated (FR‑6). The image pointer's name is the shared
 * `CHATGPT_ATTACHMENT_PLACEHOLDER` ('فایل پیوست') set by normalization, not a
 * broken image — visual only, no preview/open affordance.
 */
export function AttachmentCard({ attachments }: AttachmentCardProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <ul className={styles.list}>
      {attachments.map((file) => (
        <li
          key={file.fileId}
          className={styles.card}
          data-attachment={file.fileName}
        >
          <FileText size={18} aria-hidden="true" className={styles.icon} />
          <span className={styles.name}>
            {file.fileName === '' ? t('themes.unnamedFile') : file.fileName}
          </span>
          {file.fileSize !== undefined && (
            <span className={styles.size}>{formatSize(file.fileSize, t)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Humanises a byte count the way the existing metadata panel does. */
function formatSize(bytes: number, t: Translator): string {
  if (bytes < 1024) {
    return t('themes.attachmentBytes', { value: bytes });
  }
  if (bytes < 1024 * 1024) {
    return t('themes.attachmentKb', { value: (bytes / 1024).toFixed(1) });
  }
  return t('themes.attachmentMb', { value: (bytes / (1024 * 1024)).toFixed(1) });
}
