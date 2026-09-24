import type { JSX } from 'react';
import { FileText } from 'lucide-react';
import type { UnifiedAttachment } from '@/types/conversation';
// Reused, not duplicated: the import pipeline already owns byte formatting
// (`ai-workflow-rules.md` §10 — reuse before building).
import { formatFileSize } from '@/features/import/fileTypeGuard';
import styles from './AttachmentCard.module.css';

interface AttachmentCardProps {
  readonly attachments: readonly UnifiedAttachment[];
}

/**
 * Files a message carried, described only by what the export states: name and,
 * when the export records one, size. No preview and no open/download affordance
 * exist because the export contains no file bytes — fabricating one would
 * pretend data we don't have. The card is a plain list item, not a button: it
 * must not look interactive.
 *
 * Claude's export carries no file size at all, so the size chip renders only
 * when a size exists instead of showing a fabricated `0 B`.
 */
export function AttachmentCard({
  attachments,
}: AttachmentCardProps): JSX.Element {
  return (
    <ul className={styles.list}>
      {attachments.map((file) => (
        <li key={file.fileId} className={styles.card} data-attachment={file.fileName}>
          <FileText size={18} aria-hidden="true" className={styles.icon} />
          <span className={styles.name}>{file.fileName}</span>
          {file.fileSize !== undefined && (
            <span className={styles.size}>{formatFileSize(file.fileSize)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
