import { getCsrfToken } from './csrf';

function clearCookies() {
  for (const c of document.cookie.split(';')) {
    const eq = c.indexOf('=');
    const name = (eq > -1 ? c.slice(0, eq) : c).trim();
    if (name) document.cookie = `${name}=;max-age=0;path=/`;
  }
}

describe('getCsrfToken', () => {
  beforeEach(clearCookies);
  afterEach(clearCookies);

  it('returns undefined when no csrf cookie is present', () => {
    expect(getCsrfToken()).toBeUndefined();
  });

  it('reads the csrf cookie value', () => {
    document.cookie = 'csrf=abc123';
    expect(getCsrfToken()).toBe('abc123');
  });

  it('URL-decodes the value', () => {
    document.cookie = 'csrf=a%2Bb%3Dc'; // encodes "a+b=c"
    expect(getCsrfToken()).toBe('a+b=c');
  });

  it('picks csrf out of several cookies regardless of position', () => {
    document.cookie = 'foo=1';
    document.cookie = 'csrf=tok';
    document.cookie = 'bar=2';
    expect(getCsrfToken()).toBe('tok');
  });

  it('does not match a cookie whose name merely ends with csrf', () => {
    document.cookie = 'xcsrf=nope';
    expect(getCsrfToken()).toBeUndefined();
  });
});
