import { PostgresSyncDatabase } from '@/lib/postgres-sync';

/**
 * One database client per server process. Each PostgresSyncDatabase owns a
 * worker thread holding an open PostgreSQL connection, and Next.js dev
 * re-evaluates this module on every recompile. Creating a new instance each
 * time leaked a connection per recompile until PostgreSQL ran out of slots
 * ("remaining connection slots are reserved…", code 53300), so the instance
 * is cached on globalThis and reused.
 *
 * The application only opens an existing database. Schema creation and seed
 * data are intentionally managed outside the application by database/*.sql.
 */
const DB_KEY = Symbol.for('asrs.postgresSyncDatabase');
const db = globalThis[DB_KEY] ?? (globalThis[DB_KEY] = new PostgresSyncDatabase());

/**
 * Kept as a compatibility hook for callers that previously initialized the
 * database before executing a query. It must never mutate database state.
 */
function initializeDatabase() {
  return db;
}

export { db, initializeDatabase };
export default db;
