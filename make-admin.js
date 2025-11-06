const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

const phone = process.argv[2];

if (!phone) {
  console.error('Usage: node make-admin.js <phone_number>');
  console.error('Example: node make-admin.js 9876543210');
  process.exit(1);
}

try {
  const user = db.prepare('SELECT id, phone, is_admin FROM users WHERE phone = ?').get(phone);
  
  if (!user) {
    console.error(`❌ User with phone number ${phone} not found.`);
    console.log('\nPlease register the user first or check the phone number.');
    process.exit(1);
  }

  if (user.is_admin === 1) {
    console.log(`✅ User ${phone} is already an admin.`);
    process.exit(0);
  }

  db.prepare('UPDATE users SET is_admin = 1 WHERE phone = ?').run(phone);
  
  console.log(`✅ Successfully made user ${phone} an admin!`);
  console.log('\nUser Details:');
  console.log(`- Phone: ${user.phone}`);
  console.log(`- User ID: ${user.id}`);
  console.log(`- Admin Status: Yes`);
  console.log('\nYou can now login and access the admin panel at /admin.html');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  db.close();
}
