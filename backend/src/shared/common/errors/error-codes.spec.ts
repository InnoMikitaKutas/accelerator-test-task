import { AppErrorCode, ERROR_META } from './error-codes';

describe('error catalog', () => {
  it('has metadata for every AppErrorCode member', () => {
    for (const code of Object.values(AppErrorCode)) {
      expect(ERROR_META[code]).toBeDefined();
      expect(ERROR_META[code].status).toBeGreaterThanOrEqual(400);
      expect(ERROR_META[code].message.length).toBeGreaterThan(0);
    }
  });

  it('maps representative codes to the documented HTTP statuses', () => {
    expect(ERROR_META[AppErrorCode.INVALID_CREDENTIALS].status).toBe(401);
    expect(ERROR_META[AppErrorCode.EMAIL_NOT_VERIFIED].status).toBe(403);
    expect(ERROR_META[AppErrorCode.EMAIL_EXISTS].status).toBe(409);
    expect(ERROR_META[AppErrorCode.SHARELINK_EXPIRED].status).toBe(410);
    expect(ERROR_META[AppErrorCode.FILE_TOO_LARGE].status).toBe(413);
    expect(ERROR_META[AppErrorCode.RATE_LIMITED].status).toBe(429);
  });
});
