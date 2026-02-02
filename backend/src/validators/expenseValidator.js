const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const expenseValidator = [
  body('amount').isNumeric().withMessage('Amount must be a number'),
  body('category_id').isInt().withMessage('Category ID must be an integer'),
  body('description').optional().isString(),
  body('date').isISO8601().withMessage('Date must be a valid YYYY-MM-DD format'),
  validate
];

module.exports = { expenseValidator };
