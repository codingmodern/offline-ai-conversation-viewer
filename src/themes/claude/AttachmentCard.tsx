import type { JSX } from 'react';
import { FileText } from 'lucide-react';
import type { UnifiedAttachment } from '@/types/conversation';
import styles from './AttachmentCard.module.css';

interface AttachmentCardProps {
  readonly attachments: readonly UnifiedAttachment[];
}

/**
 * Files a Claude message carried, described only by what the export states.
 *
 * Claude's export proves only `file_uuid`/`file_name` for each entry — no
 * size, no path, no bytes — so the card shows the name alone: no size chip to
 * fabricate, no preview, no open/download affordance. Entries whose
 * `file_name` is an empty string (attested in the real export) still render,
 * as an unnamed card, because dropping them would hide files the user sent.
 * The card is a plain list item, not a button: it must not look interactive.
 */
export function AttachmentCard({
  attachments,
}: AttachmentCardProps): JSX.Element {
  return (
    <ul className={styles.list}>
      {attachments.map((file) => (
        <li key={file.fileId} className={styles.card} data-attachment={file.fileName}>
          <FileText size={18} aria-hidden="true" className={styles.icon} />
          <span className={styles.name}>{file.fileName === '' ? 'فایل بی‌نام' : file.fileName}</span>
        </li>
      ))}
    </ul>
  );
}
