import { useId, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { cx } from '@/lib/cx';
import { assetUrl } from '@/lib/assetUrl';
import { PHOTO_TYPES, validateImage } from '@/lib/uploadGuard';
import { parseApiError } from '@/services/apiError';
import { useUploadProfilePhotoMutation } from '@/features/profile/api';
import styles from './uploader.module.css';

export interface PhotoUploaderProps {
  /** Current stored avatar thumbnail URL (foreign asset origin, C1); shown until replaced. */
  currentUrl: string | null;
  /** Owner's name — avatar alt text + monogram fallback. */
  name: string;
}

const ACCEPT = PHOTO_TYPES.join(',');

/** jsdom (and other non-DOM envs) lack URL.createObjectURL — degrade to no local preview. */
function safeObjectUrl(file: File): string | null {
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/**
 * Avatar uploader (FR-038). Drag/drop or pick PNG/JPG ≤2MB. The client guard
 * (lib/uploadGuard, M4) runs BEFORE any POST so the user gets instant feedback and we
 * never buffer-then-413. On success the server's async-generated thumbnail is rendered
 * from its foreign asset origin via assetUrl()+<img> (C1) — never inlined.
 */
export function PhotoUploader({ currentUrl, name }: Readonly<PhotoUploaderProps>) {
  const [upload, { isLoading }] = useUploadProfilePhotoMutation();
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadedThumb, setUploadedThumb] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  // Local object-URL preview while uploading → otherwise the canonical server thumbnail.
  const src = preview ?? assetUrl(uploadedThumb ?? currentUrl);

  const handleFile = async (file: File | undefined) => {
    if (!file || isLoading) return;

    const check = validateImage(file, { types: PHOTO_TYPES }); // M4 — guard before POST
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
      setUploadedThumb(result.thumbnailUrl);
    } catch (e) {
      const { errorCode, message } = parseApiError(e);
      if (errorCode === 'FILE_TOO_LARGE') setError('That file is too large (max 2 MB).');
      else if (errorCode === 'UNSUPPORTED_FILE_TYPE') setError('That file type is not supported.');
      else setError(message ?? 'Upload failed. Please try again.');
    } finally {
      // The preview has served its purpose — we now show the thumbnail (success) or
      // fall back to the current photo (failure). Revoke to avoid leaking the URL.
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
        <span className={styles.avatar}>
          {src ? (
            // C1: foreign asset origin — render via <img src>, never inline markup.
            <img src={src} alt={`${name}'s profile photo`} className={styles.avatarImg} />
          ) : (
            <span className={styles.monogram} aria-hidden="true">
              {initials(name)}
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
            ref={inputRef}
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
            <Camera size={16} aria-hidden="true" />
            {isLoading ? 'Uploading…' : 'Change photo'}
          </label>
          <p className={styles.hint}>PNG or JPG, up to 2&nbsp;MB. Drag a file here or choose one.</p>
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
