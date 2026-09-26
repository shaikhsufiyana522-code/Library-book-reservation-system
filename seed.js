require('dotenv').config();
const bcrypt = require('bcryptjs'), db = require('./config/db');
(async () => {
  await db.query("INSERT IGNORE INTO users(name,email,password,role) VALUES(?,?,?,'admin')", ['Librarian', 'admin@library.com', await bcrypt.hash('Admin@123', 10)]);
  const books = [
    ['Clean Code', 'Robert C. Martin', 'Programming', '9780132350884', 3],
    ['The Pragmatic Programmer', 'Andrew Hunt', 'Programming', '9780135957059', 2],
    ['Atomic Habits', 'James Clear', 'Self-help', '9780735211292', 4],
    ['Sapiens', 'Yuval Noah Harari', 'History', '9780062316097', 2],
    ['The Alchemist', 'Paulo Coelho', 'Fiction', '9780062315007', 3],
    ['Wings of Fire', 'A. P. J. Abdul Kalam', 'Biography', '9788173711466', 1]
  ];
  for (const b of books) await db.query('INSERT IGNORE INTO books(title,author,category,isbn,total_copies,available_copies) VALUES(?,?,?,?,?,?)', [...b, b[4]]);
  console.log('Seeded. Admin login: admin@library.com / Admin@123');
  process.exit();
})();
