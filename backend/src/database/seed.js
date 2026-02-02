const { getDb } = require('./db');
const { initDb } = require('./schema');
const bcrypt = require('bcryptjs');

async function seed() {
  try {
    console.log('Initializing database...');
    await initDb();
    const db = await getDb();

    // Check if categories already exist
    const categoriesCount = await db.get('SELECT COUNT(*) as count FROM categories');
    
    if (categoriesCount.count === 0) {
      console.log('Seeding categories...');
      const categories = ['Food', 'Transport', 'Entertainment', 'Shopping', 'Bills', 'Health', 'Other'];
      const stmt = await db.prepare('INSERT INTO categories (name, icon) VALUES (?, ?)');
      for (const cat of categories) {
        await stmt.run(cat, 'default-icon');
      }
      await stmt.finalize();
    }

    // Check if demo user exists
    const userExist = await db.get('SELECT id FROM users WHERE email = ?', ['demo@example.com']);
    if (!userExist) {
        console.log('Seeding demo user...');
        const hashedPassword = await bcrypt.hash('password123', 10);
        const result = await db.run(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            ['Demo User', 'demo@example.com', hashedPassword]
        );
        const userId = result.lastID;

        console.log('Seeding demo expenses...');
        const demoExpenses = [
            [userId, 1, 25.50, 'Lunch at Cafe', '2023-11-01'],
            [userId, 2, 15.00, 'Uber ride', '2023-11-02'],
            [userId, 5, 120.00, 'Electricity Bill', '2023-11-05'],
            [userId, 3, 50.00, 'Movie Night', '2023-11-08'],
            [userId, 4, 200.00, 'New Shoes', '2023-11-10']
        ];

        const expStmt = await db.prepare('INSERT INTO expenses (user_id, category_id, amount, description, date) VALUES (?, ?, ?, ?, ?)');
        for (const exp of demoExpenses) {
            await expStmt.run(...exp);
        }
        await expStmt.finalize();
    }

    console.log('Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seed();
