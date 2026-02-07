import { backendClient } from '../../utils/backendClient.js';
import { validateAmount, normalizeCategory, parseDate, validateDescription } from '../../validators/expenseValidator.js';
import { findCategoryByName } from '../../utils/categoryCache.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('modify-expense-tool');

export const modifyExpenseTool = {
  definition: {
    type: "function",
    function: {
      name: "modify_expense",
      description: "Updates an existing expense in the tracker. Use this when the user wants to change or edit an expense. The expense must be identified by its ID.",
      parameters: {
        type: "object",
        properties: {
          expense_id: {
            type: "integer",
            description: "The ID of the expense to modify. Must first use list_expenses to find the expense ID."
          },
          amount: { 
            type: "number", 
            description: "The new amount spent (e.g. 450.50). Optional - only include if user wants to change it." 
          },
          category: { 
            type: "string", 
            description: "The new category (e.g., 'food', 'transport'). Will be normalized automatically. Optional - only include if user wants to change it."
          },
          description: { 
            type: "string", 
            description: "The new description. Optional - only include if user wants to change it." 
          },
          expense_date: { 
            type: "string", 
            description: "The new date. Supports: 'today', 'yesterday', 'YYYY-MM-DD', 'DD/MM/YYYY'. Optional - only include if user wants to change it." 
          }
        },
        required: ["expense_id"]
      }
    }
  },
  run: async (args, token) => {
    logger.info('modify_expense tool called', { 
      expenseId: args.expense_id, 
      hasAmount: args.amount !== undefined,
      hasCategory: args.category !== undefined,
      hasDescription: args.description !== undefined,
      hasDate: args.expense_date !== undefined,
      hasToken: !!token
    });
    
    // First, get the current expense to preserve unchanged fields
    logger.debug('Fetching current expense', { expenseId: args.expense_id });
    
    let currentExpense;
    try {
      currentExpense = await backendClient.get(`/expenses/${args.expense_id}`, {}, token);
      logger.info('Current expense fetched', { 
        expenseId: args.expense_id,
        currentData: currentExpense 
      });
    } catch (error) {
      logger.error('Failed to fetch current expense', { 
        expenseId: args.expense_id,
        error: error.message,
        status: error.response?.status
      });
      throw new Error(`Expense with ID ${args.expense_id} not found: ${error.message}`);
    }
    
    if (!currentExpense) {
      logger.error('Expense not found', { expenseId: args.expense_id });
      throw new Error(`Expense with ID ${args.expense_id} not found.`);
    }
    
    // Validate and normalize updates BEFORE sending
    try {
      // Validate/normalize only the fields being changed
      const updates = {};
      
      if (args.amount !== undefined) {
        updates.amount = validateAmount(args.amount);
        logger.debug('Amount validated', { original: args.amount, validated: updates.amount });
      } else {
        updates.amount = currentExpense.amount;
      }
      
      if (args.description !== undefined) {
        updates.description = validateDescription(args.description);
        logger.debug('Description validated', { validated: updates.description });
      } else {
        updates.description = currentExpense.description;
      }
      
      if (args.expense_date !== undefined) {
        updates.date = parseDate(args.expense_date);
        logger.debug('Date parsed', { original: args.expense_date, parsed: updates.date });
      } else {
        updates.date = currentExpense.date;
      }
      
      // Handle category update
      if (args.category) {
        const normalizedCategory = normalizeCategory(args.category);
        logger.debug('Category normalized', { original: args.category, normalized: normalizedCategory });
        
        const matchedCategory = await findCategoryByName(normalizedCategory, token);
        
        if (!matchedCategory) {
          logger.error('Category not found', { normalizedCategory });
          throw new Error(`Category "${normalizedCategory}" not found in backend. Please use one of: Food, Transport, Entertainment, Shopping, Bills, Health, Other`);
        }
        
        logger.debug('Category matched', { category: matchedCategory });
        updates.category_id = matchedCategory.id;
      } else {
        updates.category_id = currentExpense.category_id;
      }
      
      logger.info('Expense updates validated, sending to backend', { 
        expenseId: args.expense_id,
        updates 
      });
      
      const result = await backendClient.put(`/expenses/${args.expense_id}`, updates, token);
      logger.info('Expense modified successfully', { expenseId: args.expense_id, result });
      return result;
      
    } catch (validationError) {
      logger.error('Expense modification validation failed', { 
        expenseId: args.expense_id,
        error: validationError.message,
        stack: validationError.stack
      });
      throw new Error(`Cannot modify expense: ${validationError.message}`);
    }
  }
};
