import { validateImage, PHOTO_TYPES, LOGO_TYPES, MAX_UPLOAD_BYTES } from './uploadGuard';

function fileOfSize(bytes: number, type: string, name = 'x'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('validateImage', () => {
  it('accepts a small PNG photo', () => {
    expect(validateImage(fileOfSize(1024, 'image/png'), { types: PHOTO_TYPES })).toEqual({
      ok: true,
    });
  });

  it('rejects a file over the size cap as FILE_TOO_LARGE (M4)', () => {
    const res = validateImage(fileOfSize(MAX_UPLOAD_BYTES + 1, 'image/png'), { types: PHOTO_TYPES });
    expect(res).toMatchObject({ ok: false, errorCode: 'FILE_TOO_LARGE' });
  });

  it('rejects an unsupported MIME as UNSUPPORTED_FILE_TYPE', () => {
    const res = validateImage(fileOfSize(10, 'image/gif'), { types: PHOTO_TYPES });
    expect(res).toMatchObject({ ok: false, errorCode: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('accepts SVG for logos but not for photos (C1)', () => {
    const svg = fileOfSize(10, 'image/svg+xml');
    expect(validateImage(svg, { types: LOGO_TYPES })).toEqual({ ok: true });
    expect(validateImage(svg, { types: PHOTO_TYPES })).toMatchObject({
      ok: false,
      errorCode: 'UNSUPPORTED_FILE_TYPE',
    });
  });
});
