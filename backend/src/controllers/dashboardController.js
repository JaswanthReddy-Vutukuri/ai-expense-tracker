const { getDb } = require('../database/db');

exports.getSummary = async (req, res, next) => {
  try {
    const db = await getDb();
    const userId = req.user.id;

    // Total Spent
    const totalResult = await db.get(
      'SELECT SUM(amount) as total FROM expenses WHERE user_id = ?',
      [userId]
    );

    // This Month Spent
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const monthResult = await db.get(
      "SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND date LIKE ?",
      [userId, `${currentMonth}%`]
    );

    // Breakdown by Category
    const categoryBreakdown = await db.all(
      `SELECT c.name, SUM(e.amount) as total, COUNT(e.id) as count
       FROM expenses e
       JOIN categories c ON e.category_id = c.id
       WHERE e.user_id = ?
       GROUP BY c.id`,
       [userId]
    );

    // Recent 5 transactions
    const recentExpenses = await db.all(
      `SELECT e.*, c.name as category_name 
       FROM expenses e 
       JOIN categories c ON e.category_id = c.id 
       WHERE e.user_id = ?
       ORDER BY e.date DESC LIMIT 5`,
       [userId]
    );

    res.json({
      total_spent: totalResult.total || 0,
      month_spent: monthResult.total || 0,
      category_breakdown: categoryBreakdown,
      recent_expenses: recentExpenses
    });
  } catch (error) {
    next(error);
  }
};
