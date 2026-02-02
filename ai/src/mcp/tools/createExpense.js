import { backendClient } from '../../utils/backendClient.js';
import { validateAmount, normalizeCategory, parseDate, validateDescription } from '../../validators/expenseValidator.js';
import { findCategoryByName } from '../../utils/categoryCache.js';

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
    // AUDIT FIX: Part 3 - Validate and normalize BEFORE sending to backend
    // This ensures deterministic, predictable expense creation (not LLM-dependent)
    try {
      const validatedAmount = validateAmount(args.amount);
      const normalizedCategory = normalizeCategory(args.category);
      const parsedDate = parseDate(args.expense_date || 'today');
      const validatedDescription = args.description ? validateDescription(args.description) : '';
      
      console.log(`[Create Expense Tool] Validated: amount=${validatedAmount}, category="${normalizedCategory}", date=${parsedDate}`);
      
      // Fetch category from backend using cache
      const matchedCategory = await findCategoryByName(normalizedCategory, token);
      
      if (!matchedCategory) {
        // This shouldn't happen if validator is correct, but defensive check
        throw new Error(`Category "${normalizedCategory}" not found in backend. Please use one of: Food, Transport, Entertainment, Shopping, Bills, Health, Other`);
      }
      
      // Map to backend format with validated values
      const backendPayload = {
        amount: validatedAmount,
        category_id: matchedCategory.id,
        description: validatedDescription,
        date: parsedDate
      };
      
      return await backendClient.post('/expenses', backendPayload, token);
      
    } catch (validationError) {
      // Return validation errors to agent so it can ask user for clarification
      console.error(`[Create Expense Tool] Validation failed: ${validationError.message}`);
      throw new Error(`Cannot create expense: ${validationError.message}`);
    }
  }
};
