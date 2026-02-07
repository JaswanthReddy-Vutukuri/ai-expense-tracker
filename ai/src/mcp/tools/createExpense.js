import { backendClient } from '../../utils/backendClient.js';
import { validateAmount, normalizeCategory, parseDate, validateDescription } from '../../validators/expenseValidator.js';
import { findCategoryByName } from '../../utils/categoryCache.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('create-expense-tool');

export const createExpenseTool = {
  definition: {
    type: "function",
    function: {
      name: "create_expense",
      description: "Adds a new expense to the tracker. Use this when the user mentions spending money. Categories and dates are normalized automatically - just pass what the user said.",
      parameters: {
        type: "object",
        properties: {
          amount: { 
            type: "number", 
            description: "The amount spent (e.g. 450.50)" 
          },
          category: { 
            type: "string", 
            description: "Expense category (e.g., 'food', 'transport', 'entertainment'). Will be normalized to standard categories automatically."
          },
          description: { 
            type: "string", 
            description: "Brief detail describing what the money was spent on" 
          },
          expense_date: { 
            type: "string", 
            description: "Date of expense. Supports: 'today', 'yesterday', 'YYYY-MM-DD', 'DD/MM/YYYY'. Defaults to today if not provided." 
          }
        },
        required: ["amount", "category"]
      }
    }
  },
  run: async (args, token) => {
    logger.info('create_expense tool called', { args, hasToken: !!token });
    
    // Validate and normalize BEFORE sending to backend
    // This ensures deterministic, predictable expense creation (not LLM-dependent)
    try {
      logger.debug('Starting validation', { args });
      
      const validatedAmount = validateAmount(args.amount);
      const normalizedCategory = normalizeCategory(args.category);
      const parsedDate = parseDate(args.expense_date || 'today');
      const validatedDescription = args.description ? validateDescription(args.description) : '';
      
      logger.info('Expense validated', { 
        amount: validatedAmount, 
        category: normalizedCategory, 
        date: parsedDate,
        description: validatedDescription
      });
      
      logger.debug('Fetching category from backend', { normalizedCategory });
      
      // Fetch category from backend using cache
      const matchedCategory = await findCategoryByName(normalizedCategory, token);
      
      if (!matchedCategory) {
        logger.error('Category not found in backend', { 
          normalizedCategory,
          error: `Category "${normalizedCategory}" not found` 
        });
        // This shouldn't happen if validator is correct, but defensive check
        throw new Error(`Category "${normalizedCategory}" not found in backend. Please use one of: Food, Transport, Entertainment, Shopping, Bills, Health, Other`);
      }
      
      logger.info('Category matched', { categoryId: matchedCategory.id, categoryName: matchedCategory.name });
      
      // Map to backend format with validated values
      const backendPayload = {
        amount: validatedAmount,
        category_id: matchedCategory.id,
        description: validatedDescription,
        date: parsedDate
      };
      
      logger.info('Calling backend API', { 
        endpoint: '/expenses',
        payload: backendPayload,
        hasToken: !!token
      });
      
      const result = await backendClient.post('/expenses', backendPayload, token);
      
      logger.info('Backend API call successful', { result });
      
      return result;
      
    } catch (validationError) {
      // Return validation errors to agent so it can ask user for clarification
      logger.error('Expense creation failed', { 
        error: validationError.message,
        stack: validationError.stack
      });
      throw new Error(`Cannot create expense: ${validationError.message}`);
    }
  }
};
