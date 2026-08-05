import { PostgresSyncDatabase } from './src/lib/postgres-sync.js';

const db = new PostgresSyncDatabase();

console.log('Promoting test user to admin...\n');

// Get admin user_type_id
const adminType = db.prepare('SELECT user_type_id FROM user_type WHERE type = ?').get('admin');
const staffType = db.prepare('SELECT user_type_id FROM user_type WHERE type = ?').get('staff');

// Promote test@gmail.com to admin
const result = db.prepare(`
  UPDATE user SET user_type_id = ? WHERE email = ?
`).run(adminType.user_type_id, 'test@gmail.com');

if (result.changes > 0) {
  console.log('✔ Promoted test@gmail.com to admin');
} else {
  console.log('⚠ test@gmail.com not found in database');
}

// Add a staff test user if one doesn't exist
try {
  db.prepare(`
    INSERT INTO user (first_name, last_name, email, password, user_type_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('Jane', 'Staff', 'staff@gmail.com', 'testing', staffType.user_type_id);
  console.log('✔ Created staff test user: staff@gmail.com / testing');
} catch (err) {
  if (err.message.includes('UNIQUE')) {
    console.log('✔ staff@gmail.com already exists');
  } else {
    console.error('Error:', err.message);
  }
}

console.log('\n✅ Done! Login with test@gmail.com / testing to see the User Management tab.');

