import { useId, useRef, useState, type DragEvent, type ChangeEvent, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ImportDropzone.module.css';

interface ImportDropzoneProps {
  readonly onFilesSelected: (files: readonly File[]) => void;
}

/**
 * Idle / dragging import surface offering both entry points required by
 * `01-import-validation.md` FR1 & FR2: a file picker and drag & drop.
 *
 * Keyboard users get the same capability through the real `<button>`, so the
 * feature is fully operable without a pointer (`ui-context.md` §6).
 */
export function ImportDropzone({ onFilesSelected }: ImportDropzoneProps): JSX.Element {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const descriptionId = useId();

  const emit = (fileList: FileList | null): void => {
    if (!fileList || fileList.length === 0) {
      return;
    }
    onFilesSelected(Array.from(fileList));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    emit(event.target.files);
    // Reset so selecting the same file twice in a row still fires `change`.
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    emit(event.dataTransfer.files);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    // Required, otherwise the browser navigates to the dropped file.
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    // Ignore leave events fired while moving between child elements.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragging(false);
  };

  return (
    <div
      className={`${styles.zone} ${isDragging ? styles.dragging : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-dragging={isDragging}
    >
      <p className={styles.title}>{t('import.dropzoneTitle')}</p>
      <p className={styles.hint} id={descriptionId}>
        {t('import.dropzoneHint')}
      </p>
      <button
        type="button"
        className={styles.button}
        onClick={() => {
          inputRef.current?.click();
        }}
        aria-describedby={descriptionId}
      >
        {t('import.chooseFile')}
      </button>
      <input
        ref={inputRef}
        type="file"
        className={styles.input}
        accept="application/json,.json"
        multiple
        onChange={handleChange}
        aria-label={t('import.fileInputLabel')}
      />
    </div>
  );
}
