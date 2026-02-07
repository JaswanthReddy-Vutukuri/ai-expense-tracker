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
    const { category_id, startDate, endDate, page = 1, limit = 10, sortBy = 'date', sortOrder = 'desc' } = req.query;
    const db = await getDb();
    
    // Build base WHERE clause
    let whereClause = 'WHERE e.user_id = ?';
    const params = [req.user.id];

    if (category_id) {
      whereClause += ' AND e.category_id = ?';
      params.push(category_id);
    }

    if (startDate && endDate) {
      whereClause += ' AND e.date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    // Validate and build ORDER BY clause
    const allowedSortFields = ['date', 'amount', 'description', 'category_name'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'date';
    const validSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const orderByColumn = validSortBy === 'category_name' ? 'c.name' : `e.${validSortBy}`;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM expenses e
      ${whereClause}
    `;
    const { total } = await db.get(countQuery, params);

    // Get paginated data
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const dataQuery = `
      SELECT e.*, c.name as category_name 
      FROM expenses e 
      JOIN categories c ON e.category_id = c.id 
      ${whereClause}
      ORDER BY ${orderByColumn} ${validSortOrder}
      LIMIT ? OFFSET ?
    `;
    const expenses = await db.all(dataQuery, [...params, parseInt(limit), offset]);
    
    res.json({
      data: expenses,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
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
