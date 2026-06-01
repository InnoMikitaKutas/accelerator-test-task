/**
 * Client-side upload pre-validation (M4): reject oversized/wrong-type files BEFORE
 * the POST, so the user gets instant feedback and we never buffer-then-413. Mirrors
 * the server's ParseFilePipe limits; the server remains the source of truth.
 */

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

/** Profile photos: PNG/JPG only. */
export const PHOTO_TYPES = ['image/png', 'image/jpeg'] as const;
/** Logos: PNG/JPG/SVG — SVG accepted because the server sanitizes it (C1). */
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;

export interface UploadConstraints {
  maxBytes?: number;
  types: readonly string[];
}

export type UploadGuardResult =
  | { ok: true }
  | { ok: false; errorCode: 'FILE_TOO_LARGE' | 'UNSUPPORTED_FILE_TYPE'; message: string };

export function validateImage(
  file: File,
  { maxBytes = MAX_UPLOAD_BYTES, types }: UploadConstraints,
): UploadGuardResult {
  if (!types.includes(file.type)) {
    return {
      ok: false,
      errorCode: 'UNSUPPORTED_FILE_TYPE',
      message: 'That file type is not supported.',
    };
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return {
      ok: false,
      errorCode: 'FILE_TOO_LARGE',
      message: `That file is too large (max ${mb} MB).`,
    };
  }
  return { ok: true };
}
