const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { protect } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * /dashboard/summary:
 *   get:
 *     summary: Get dashboard summary with expense statistics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for summary calculation
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for summary calculation
 *     responses:
 *       200:
 *         description: Dashboard summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalExpenses:
 *                   type: number
 *                   description: Total amount of expenses
 *                 expenseCount:
 *                   type: integer
 *                   description: Number of expenses
 *                 categoryBreakdown:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       category_name:
 *                         type: string
 *                       total:
 *                         type: number
 *       401:
 *         description: Unauthorized
 */
router.get('/summary', protect, dashboardController.getSummary);

module.exports = router;
