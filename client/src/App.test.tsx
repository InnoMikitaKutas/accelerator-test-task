import { http, HttpResponse } from 'msw';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { makeStore } from '@/app/store';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import App from './App';

describe('App', () => {
  it('boots an unauthenticated visitor to the login screen', async () => {
    server.use(
      http.get(apiUrl('/auth/me'), () =>
        HttpResponse.json({ errorCode: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
      http.post(apiUrl('/auth/refresh'), () =>
        HttpResponse.json({ errorCode: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
    );

    render(
      <Provider store={makeStore()}>
        <App />
      </Provider>,
    );

    expect(await screen.findByRole('heading', { name: /log in/i })).toBeInTheDocument();
  });
});
