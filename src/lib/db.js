import { PostgresSyncDatabase } from '@/lib/postgres-sync';

/**
 * The application only opens an existing database. Schema creation and seed
 * data are intentionally managed outside the application by database/*.sql.
 */
const db = new PostgresSyncDatabase();

/**
 * Kept as a compatibility hook for callers that previously initialized the
 * database before executing a query. It must never mutate database state.
 */
function initializeDatabase() {
  return db;
}

export { db, initializeDatabase };
export default db;
