import { backendClient } from '../../utils/backendClient.js';
import { validateAmount, normalizeCategory, parseDate, validateDescription } from '../../validators/expenseValidator.js';
import { findCategoryByName } from '../../utils/categoryCache.js';

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
    // First, get the current expense to preserve unchanged fields
    const currentExpense = await backendClient.get(`/expenses/${args.expense_id}`, {}, token);
    
    if (!currentExpense) {
      throw new Error(`Expense with ID ${args.expense_id} not found.`);
    }
    
    // AUDIT FIX: Part 3 - Validate and normalize updates BEFORE sending
    try {
      // Validate/normalize only the fields being changed
      const updates = {};
      
      if (args.amount !== undefined) {
        updates.amount = validateAmount(args.amount);
      } else {
        updates.amount = currentExpense.amount;
      }
      
      if (args.description !== undefined) {
        updates.description = validateDescription(args.description);
      } else {
        updates.description = currentExpense.description;
      }
      
      if (args.expense_date !== undefined) {
        updates.date = parseDate(args.expense_date);
      } else {
        updates.date = currentExpense.date;
      }
      
      // Handle category update
      if (args.category) {
        const normalizedCategory = normalizeCategory(args.category);
        const matchedCategory = await findCategoryByName(normalizedCategory, token);
        
        if (!matchedCategory) {
          throw new Error(`Category "${normalizedCategory}" not found in backend. Please use one of: Food, Transport, Entertainment, Shopping, Bills, Health, Other`);
        }
        updates.category_id = matchedCategory.id;
      } else {
        updates.category_id = currentExpense.category_id;
      }
      
      console.log(`[Modify Expense Tool] Validated updates for expense ${args.expense_id}`);
      
      return await backendClient.put(`/expenses/${args.expense_id}`, updates, token);
      
    } catch (validationError) {
      console.error(`[Modify Expense Tool] Validation failed: ${validationError.message}`);
      throw new Error(`Cannot modify expense: ${validationError.message}`);
    }
  }
};
