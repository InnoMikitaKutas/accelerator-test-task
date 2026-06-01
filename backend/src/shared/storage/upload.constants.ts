/** FR-037/FR-038/§13 — hard upload ceiling enforced by multer BEFORE buffering the whole body. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
export const UPLOAD_LIMITS = { fileSize: MAX_UPLOAD_BYTES, files: 1 } as const;
