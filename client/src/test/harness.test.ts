import { http, HttpResponse } from 'msw';
import { server } from './server';
import { apiUrl } from './handlers';

describe('MSW test harness', () => {
  it('intercepts a registered request', async () => {
    server.use(http.get(apiUrl('/ping'), () => HttpResponse.json({ ok: true })));

    const res = await fetch(apiUrl('/ping'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('injects the test env into import.meta.env', () => {
    expect(import.meta.env.VITE_API_URL).toBe('http://localhost:3000/api/v1');
    expect(import.meta.env.VITE_ASSET_BASE_URL).toBe('http://localhost:3000/static');
  });
});
