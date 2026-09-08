import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createDb(connectionString: string | undefined = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

/**
 * Anything that can run a query: the pooled connection, or a transaction handle from
 * `db.transaction(...)`. Lets helpers like TicketKeyService be called standalone or
 * enlisted in a caller's transaction (M5 allocates a key inside the ticket insert's tx).
 */
export type DbExecutor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
