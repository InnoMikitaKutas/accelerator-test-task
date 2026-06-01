import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Shared MSW server for all tests. Add per-test handlers with server.use(...). */
export const server = setupServer(...handlers);
