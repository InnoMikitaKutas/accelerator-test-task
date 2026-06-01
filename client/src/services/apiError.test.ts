import { parseApiError } from './apiError';

describe('parseApiError', () => {
  it('extracts errorCode, message, and details from a FetchBaseQueryError', () => {
    const parsed = parseApiError({
      status: 400,
      data: {
        statusCode: 400,
        error: 'Bad Request',
        errorCode: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'email', message: 'Invalid email format' }],
      },
    });

    expect(parsed).toEqual({
      httpStatus: 400,
      errorCode: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: [{ field: 'email', message: 'Invalid email format' }],
    });
  });

  it('reads canResend (EMAIL_NOT_VERIFIED) and retryAfterSeconds (RATE_LIMITED)', () => {
    expect(parseApiError({ status: 403, data: { errorCode: 'EMAIL_NOT_VERIFIED', canResend: true } }))
      .toMatchObject({ errorCode: 'EMAIL_NOT_VERIFIED', canResend: true });

    expect(parseApiError({ status: 429, data: { errorCode: 'RATE_LIMITED', retryAfterSeconds: 30 } }))
      .toMatchObject({ errorCode: 'RATE_LIMITED', retryAfterSeconds: 30 });
  });

  it('returns httpStatus only when status is a real HTTP code (not a fetch tag)', () => {
    expect(parseApiError({ status: 'FETCH_ERROR', error: 'offline' })).toEqual({});
    expect(parseApiError({ status: 500, data: { errorCode: 'INTERNAL' } })).toEqual({
      httpStatus: 500,
      errorCode: 'INTERNAL',
    });
  });

  it('is total — handles undefined, primitives, and dataless errors', () => {
    expect(parseApiError(undefined)).toEqual({});
    expect(parseApiError('boom')).toEqual({});
    expect(parseApiError({ name: 'TypeError', message: 'x' })).toEqual({});
    expect(parseApiError({ status: 401, data: 'Unauthorized' })).toEqual({ httpStatus: 401 });
  });
});
