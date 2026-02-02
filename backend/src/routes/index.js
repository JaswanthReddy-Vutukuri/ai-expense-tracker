const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const expenseRoutes = require('./expenseRoutes');
const dashboardRoutes = require('./dashboardRoutes');

router.use('/auth', authRoutes);
router.use('/expenses', expenseRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
