import { classifyLoginError, validationFieldErrors } from './loginError';

describe('classifyLoginError', () => {
  it('maps INVALID_CREDENTIALS to a generic inline error', () => {
    expect(classifyLoginError({ errorCode: 'INVALID_CREDENTIALS' })).toEqual({ kind: 'invalid' });
  });

  it('maps EMAIL_NOT_VERIFIED with the canResend affordance', () => {
    expect(classifyLoginError({ errorCode: 'EMAIL_NOT_VERIFIED', canResend: true })).toEqual({
      kind: 'unverified',
      canResend: true,
    });
    expect(classifyLoginError({ errorCode: 'EMAIL_NOT_VERIFIED' })).toEqual({
      kind: 'unverified',
      canResend: false,
    });
  });

  it('distinguishes ACCOUNT_INACTIVE from INVALID_CREDENTIALS (L3)', () => {
    const inactive = classifyLoginError({ errorCode: 'ACCOUNT_INACTIVE' });
    const invalid = classifyLoginError({ errorCode: 'INVALID_CREDENTIALS' });
    expect(inactive).toEqual({ kind: 'inactive' });
    expect(inactive.kind).not.toBe(invalid.kind);
  });

  it('carries Retry-After into the rate-limited view', () => {
    expect(classifyLoginError({ errorCode: 'RATE_LIMITED', retryAfterSeconds: 30 })).toEqual({
      kind: 'rateLimited',
      retryAfterSeconds: 30,
    });
  });

  it('does not banner VALIDATION_ERROR (it routes to field errors)', () => {
    expect(classifyLoginError({ errorCode: 'VALIDATION_ERROR' })).toEqual({ kind: 'none' });
    expect(
      validationFieldErrors({
        errorCode: 'VALIDATION_ERROR',
        details: [{ field: 'email', message: 'Invalid' }],
      }),
    ).toEqual([{ field: 'email', message: 'Invalid' }]);
    expect(validationFieldErrors({ errorCode: 'INVALID_CREDENTIALS' })).toEqual([]);
  });

  it('falls back to a generic foul banner for unknown codes', () => {
    expect(classifyLoginError({ errorCode: 'WEIRD', message: 'Boom' })).toEqual({
      kind: 'error',
      message: 'Boom',
    });
    expect(classifyLoginError({}).kind).toBe('error');
  });
});
