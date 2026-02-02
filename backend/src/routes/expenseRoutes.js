const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { protect } = require('../middlewares/authMiddleware');
const { expenseValidator } = require('../validators/expenseValidator');

router.use(protect);

/**
 * @swagger
 * /expenses/categories:
 *   get:
 *     summary: Get all expense categories
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of expense categories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/categories', expenseController.getCategories);

/**
 * @swagger
 * /expenses:
 *   get:
 *     summary: Get all expenses for the authenticated user
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category name
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter expenses from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter expenses until this date
 *     responses:
 *       200:
 *         description: List of expenses
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   amount:
 *                     type: number
 *                   category_id:
 *                     type: integer
 *                   category_name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   date:
 *                     type: string
 *                   user_id:
 *                     type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/', expenseController.getExpenses);

/**
 * @swagger
 * /expenses:
 *   post:
 *     summary: Create a new expense
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - category_id
 *               - date
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 50.99
 *               category_id:
 *                 type: integer
 *                 example: 1
 *               description:
 *                 type: string
 *                 example: Grocery shopping
 *               date:
 *                 type: string
 *                 format: date
 *                 example: 2026-01-31
 *     responses:
 *       201:
 *         description: Expense created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 expense:
 *                   type: object
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post('/', expenseValidator, expenseController.createExpense);

/**
 * @swagger
 * /expenses/{id}:
 *   get:
 *     summary: Get expense by ID
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Expense ID
 *     responses:
 *       200:
 *         description: Expense details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 amount:
 *                   type: number
 *                 category_id:
 *                   type: integer
 *                 category_name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 date:
 *                   type: string
 *                 user_id:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Expense not found
 */
router.get('/:id', expenseController.getExpenseById);

/**
 * @swagger
 * /expenses/{id}:
 *   put:
 *     summary: Update an expense
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Expense ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - category_id
 *               - date
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 50.99
 *               category_id:
 *                 type: integer
 *                 example: 1
 *               description:
 *                 type: string
 *                 example: Grocery shopping
 *               date:
 *                 type: string
 *                 format: date
 *                 example: 2026-01-31
 *     responses:
 *       200:
 *         description: Expense updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 expense:
 *                   type: object
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Expense not found
 */
router.put('/:id', expenseValidator, expenseController.updateExpense);

/**
 * @swagger
 * /expenses/{id}:
 *   delete:
 *     summary: Delete an expense
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Expense ID
 *     responses:
 *       200:
 *         description: Expense deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Expense not found
 */
router.delete('/:id', expenseController.deleteExpense);

module.exports = router;
