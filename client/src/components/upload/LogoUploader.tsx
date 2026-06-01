import { useId, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { cx } from '@/lib/cx';
import { assetUrl } from '@/lib/assetUrl';
import { LOGO_TYPES, validateImage } from '@/lib/uploadGuard';
import { parseApiError } from '@/services/apiError';
import { useUploadLogoMutation } from '@/features/branding/api';
import type { Branding } from '@/types/api';
import styles from './uploader.module.css';

export interface LogoUploaderProps {
  /** Current stored logo URL (foreign asset origin, C1); shown until replaced. */
  currentUrl: string | null;
  onUploaded?: (branding: Branding) => void;
}

const ACCEPT = LOGO_TYPES.join(',');

/** jsdom lacks URL.createObjectURL — degrade to no local preview. */
function safeObjectUrl(file: File): string | null {
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

/**
 * Portal LogoUploader (FR-037). Drag/drop or pick PNG/JPG/**SVG** ≤2MB. The client
 * guard (lib/uploadGuard, M4) runs BEFORE the POST so we never buffer-then-413; SVG is
 * accepted because the server sanitizes it (C1). The stored logo is rendered from its
 * foreign asset origin via assetUrl()+`<img src>` — the SVG markup is NEVER inlined
 * into the DOM (C1). `413`/`415` errors surface inline.
 */
export function LogoUploader({ currentUrl, onUploaded }: Readonly<LogoUploaderProps>) {
  const [upload, { isLoading }] = useUploadLogoMutation();
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const src = preview ?? assetUrl(uploadedUrl ?? currentUrl);

  const handleFile = async (file: File | undefined) => {
    if (!file || isLoading) return;

    const check = validateImage(file, { types: LOGO_TYPES }); // M4 — guard before POST (SVG ok, C1)
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setError(null);

    const objectUrl = safeObjectUrl(file);
    if (objectUrl) setPreview(objectUrl);

    const form = new FormData();
    form.append('file', file);
    try {
      const result = await upload(form).unwrap();
      setUploadedUrl(result.logoUrl);
      onUploaded?.(result);
    } catch (e) {
      const { errorCode, message } = parseApiError(e);
      if (errorCode === 'FILE_TOO_LARGE') setError('That file is too large (max 2 MB).');
      else if (errorCode === 'UNSUPPORTED_FILE_TYPE') setError('Use a PNG, JPG, or SVG.');
      else setError(message ?? 'Upload failed. Please try again.');
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setPreview(null);
      }
    }
  };

  return (
    <div className={styles.uploader}>
      <div
        className={cx(styles.dropZone, dragging && styles.dragging)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files[0]);
        }}
      >
        <span className={styles.logoBox}>
          {src ? (
            // C1: foreign asset origin — render via <img src>, never inline SVG markup.
            <img src={src} alt="Portal logo" className={styles.logoImg} />
          ) : (
            <span className={styles.logoPlaceholder} aria-hidden="true">
              Logo
            </span>
          )}
          {isLoading ? (
            <span className={styles.busy} aria-hidden="true">
              <Loader2 className={styles.spin} size={20} />
            </span>
          ) : null}
        </span>

        <div className={styles.actions}>
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={isLoading}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ''; // allow re-picking the same file
              void handleFile(file);
            }}
          />
          <label htmlFor={inputId} className={styles.pickLabel}>
            <ImagePlus size={16} aria-hidden="true" />
            {isLoading ? 'Uploading…' : 'Upload logo'}
          </label>
          <p className={styles.hint}>PNG, JPG, or SVG, up to 2&nbsp;MB. About 200×200.</p>
        </div>
      </div>

      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
