import { PostgresSyncDatabase } from './src/lib/postgres-sync.js';

const db = new PostgresSyncDatabase();

console.log('Adding password field to user table...');

// Add password column
try {
  db.exec(`ALTER TABLE user ADD COLUMN password TEXT;`);
  console.log('✓ Added password column');
} catch (err) {
  if (err.message.includes('duplicate column') || err.message.includes('already exists')) {
    console.log('✓ Password column already exists');
  } else {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// Add test user
console.log('\nAdding test user...');

const publicType = db.prepare('SELECT user_type_id FROM user_type WHERE type = ?').get('public');

try {
  db.prepare(`
    INSERT INTO user (first_name, last_name, email, password, user_type_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('Test', 'User', 'test@gmail.com', 'testing', publicType.user_type_id);
  console.log('✓ Created test user: test@gmail.com / testing');
} catch (err) {
  if (err.message.includes('UNIQUE')) {
    console.log('✓ Test user already exists');
  } else {
    console.error('Error:', err.message);
  }
}

console.log('\n✅ Done! You can now login with: test@gmail.com / testing');

