import { mapError, FORCED_PASSWORD_CHANGE_ROUTE } from './errorMap';

describe('mapError', () => {
  it('maps VALIDATION_ERROR to field errors from details', () => {
    const details = [{ field: 'email', message: 'Invalid email format' }];
    expect(mapError('VALIDATION_ERROR', { details })).toEqual({ kind: 'field', fields: details });
  });

  it('maps VALIDATION_ERROR with no details to empty fields', () => {
    expect(mapError('VALIDATION_ERROR')).toEqual({ kind: 'field', fields: [] });
  });

  it('maps FILE_TOO_LARGE to a field error on the file input (M4)', () => {
    const ux = mapError('FILE_TOO_LARGE');
    expect(ux.kind).toBe('field');
    if (ux.kind === 'field') expect(ux.fields[0].field).toBe('file');
  });

  it('treats UNAUTHENTICATED and CSRF_INVALID as silent', () => {
    expect(mapError('UNAUTHENTICATED')).toEqual({ kind: 'silent' });
    expect(mapError('CSRF_INVALID')).toEqual({ kind: 'silent' });
  });

  it('routes FORCE_PASSWORD_CHANGE to the forced-change screen', () => {
    expect(mapError('FORCE_PASSWORD_CHANGE')).toEqual({
      kind: 'route',
      to: FORCED_PASSWORD_CHANGE_ROUTE,
    });
  });

  it('maps RATE_LIMITED to a banner carrying Retry-After', () => {
    const ux = mapError('RATE_LIMITED', { retryAfterSeconds: 30 });
    expect(ux.kind).toBe('banner');
    if (ux.kind === 'banner') {
      expect(ux.tone).toBe('pending');
      expect(ux.retryAfterSeconds).toBe(30);
    }
  });

  it('bounces on CONTEXT_INACTIVE and CONTEXT_FORBIDDEN', () => {
    expect(mapError('CONTEXT_INACTIVE')).toEqual({ kind: 'bounce' });
    expect(mapError('CONTEXT_FORBIDDEN')).toEqual({ kind: 'bounce' });
  });

  it('shows a friendly toast for tenant/minor forbiddens (never raw 403)', () => {
    expect(mapError('TENANT_FORBIDDEN')).toMatchObject({ kind: 'toast' });
    expect(mapError('MINOR_FORBIDDEN')).toMatchObject({ kind: 'toast' });
    // Friendly copy, not the server message.
    expect(mapError('MINOR_FORBIDDEN').kind).toBe('toast');
  });

  it('falls back to a foul toast for unknown codes, preferring the server message', () => {
    expect(mapError('SOMETHING_NEW', { message: 'Boom' })).toEqual({
      kind: 'toast',
      tone: 'foul',
      message: 'Boom',
    });
  });
});
