import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/** Typed Drizzle DB handle bound to the full schema (both app and system pools share the type). */
export type DrizzleDB = NodePgDatabase<typeof schema>;
