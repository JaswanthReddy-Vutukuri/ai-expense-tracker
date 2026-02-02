const { getDb } = require('../database/db');

exports.createExpense = async (req, res, next) => {
  try {
    const { amount, category_id, description, date } = req.body;
    const db = await getDb();

    const result = await db.run(
      'INSERT INTO expenses (user_id, category_id, amount, description, date) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, category_id, amount, description, date]
    );

    const newExpense = await db.get(
      `SELECT e.*, c.name as category_name 
       FROM expenses e 
       JOIN categories c ON e.category_id = c.id 
       WHERE e.id = ?`, 
      [result.lastID]
    );

    res.status(201).json(newExpense);
  } catch (error) {
    next(error);
  }
};

exports.getExpenses = async (req, res, next) => {
  try {
    const { category_id, startDate, endDate } = req.query;
    const db = await getDb();
    
    let query = `
      SELECT e.*, c.name as category_name 
      FROM expenses e 
      JOIN categories c ON e.category_id = c.id 
      WHERE e.user_id = ?
    `;
    const params = [req.user.id];

    if (category_id) {
      query += ' AND e.category_id = ?';
      params.push(category_id);
    }

    if (startDate && endDate) {
      query += ' AND e.date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    query += ' ORDER BY e.date DESC';

    const expenses = await db.all(query, params);
    res.json(expenses);
  } catch (error) {
    next(error);
  }
};

exports.getExpenseById = async (req, res, next) => {
  try {
    const db = await getDb();
    const expense = await db.get(
      'SELECT e.*, c.name as category_name FROM expenses e JOIN categories c ON e.category_id = c.id WHERE e.id = ? AND e.user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json(expense);
  } catch (error) {
    next(error);
  }
};

exports.updateExpense = async (req, res, next) => {
  try {
    const { amount, category_id, description, date } = req.body;
    const db = await getDb();

    const expense = await db.get('SELECT id FROM expenses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    await db.run(
      'UPDATE expenses SET amount = ?, category_id = ?, description = ?, date = ? WHERE id = ?',
      [amount, category_id, description, date, req.params.id]
    );

    const updatedExpense = await db.get(
      'SELECT e.*, c.name as category_name FROM expenses e JOIN categories c ON e.category_id = c.id WHERE e.id = ?',
      [req.params.id]
    );

    res.json(updatedExpense);
  } catch (error) {
    next(error);
  }
};

exports.deleteExpense = async (req, res, next) => {
  try {
    const db = await getDb();
    const result = await db.run('DELETE FROM expenses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json({ message: 'Expense removed' });
  } catch (error) {
    next(error);
  }
};

exports.getCategories = async (req, res, next) => {
    try {
        const db = await getDb();
        const categories = await db.all('SELECT * FROM categories');
        res.json(categories);
    } catch (error) {
        next(error);
    }
};
