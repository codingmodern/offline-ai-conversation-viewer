import type { JSX } from 'react';
import { FileText, Image } from 'lucide-react';
import type { UnifiedAttachment } from '@/types/conversation';
import styles from './AttachmentCard.module.css';

interface AttachmentCardProps {
  readonly attachments: readonly UnifiedAttachment[];
}

/**
 * File names a Gemini turn carried, as **placeholders** (FR8, spec EC3/EC4).
 *
 * This export states a name and nothing else: no id, no size, no path and no
 * bytes (`imageFile` and `attachedFiles` hold file names only), so the card
 * shows exactly that — no size chip to fabricate, no download or preview
 * affordance, and no attempt to load a file that is not there. The card is a
 * plain list item, not a button: it must not look interactive.
 *
 * The icon is the only derived detail, and it is derived from the export's own
 * file name: an image extension picks the image icon, anything else the
 * document icon. That is a presentation choice about data the export states —
 * no new field and no behaviour is invented, and a name with no extension
 * simply keeps the document icon.
 */
export function AttachmentCard({ attachments }: AttachmentCardProps): JSX.Element {
  return (
    <ul className={styles.list} data-attachments="true">
      {attachments.map((file) => (
        <li key={file.fileId} className={styles.card} data-attachment={file.fileName}>
          {isImageName(file.fileName) ? (
            <Image size={18} aria-hidden="true" className={styles.icon} />
          ) : (
            <FileText size={18} aria-hidden="true" className={styles.icon} />
          )}
          <span className={styles.name}>
            {file.fileName === '' ? 'فایل بی‌نام' : file.fileName}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The image extensions this icon rule recognises, matched case-insensitively. */
const IMAGE_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'heic',
  'avif',
  'bmp',
];

function isImageName(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.');
  if (dot === -1) {
    return false;
  }
  return IMAGE_EXTENSIONS.includes(fileName.slice(dot + 1).toLowerCase());
}