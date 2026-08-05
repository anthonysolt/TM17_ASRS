/**
 * ============================================================================
 * MIGRATION — add-verification-fields.js
 * ============================================================================
 * Adds `verified` and `verification_token` columns to the user table.
 *
 * Run once from your project root:
 *   node add-verification-fields.js
 *
 * Safe to run multiple times — uses ALTER TABLE with duplicate-column guard.
 * ============================================================================
 */

import { PostgresSyncDatabase } from './src/lib/postgres-sync.js';

const db = new PostgresSyncDatabase();

function addColumnIfNotExists(table, columnDef) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
    console.log(`✔  Added column: ${table}.${columnDef.split(' ')[0]}`);
  } catch (err) {
    if (err.message.includes('duplicate column name') || err.message.includes('already exists')) {
      console.log(`–  Column already exists: ${table}.${columnDef.split(' ')[0]}`);
    } else {
      throw err;
    }
  }
}

console.log('Running verification fields migration...\n');

// verified: 0 = unverified, 1 = verified
// Existing seed/test users (admin@test.com, staff@test.com) are pre-verified
// so they can still log in without going through email flow.
addColumnIfNotExists('user', 'verified INTEGER NOT NULL DEFAULT 0');
addColumnIfNotExists('user', 'verification_token TEXT');
addColumnIfNotExists('user', 'token_expires_at TEXT');

// Pre-verify the seeded test accounts so dev login still works instantly
const updated = db.prepare(`
  UPDATE user SET verified = 1
  WHERE email IN ('admin@test.com', 'staff@test.com')
    AND verified = 0
`).run();

if (updated.changes > 0) {
  console.log(`✔  Pre-verified ${updated.changes} test account(s) (admin@test.com, staff@test.com)`);
}

console.log('\n✅ Migration complete.');
