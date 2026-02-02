import { backendClient } from '../../utils/backendClient.js';

export const deleteExpenseTool = {
  definition: {
    type: "function",
    function: {
      name: "delete_expense",
      description: "Deletes an expense from the tracker. Use this when the user wants to remove or delete an expense. The expense must be identified by its ID. IMPORTANT: Always confirm the expense details with the user before deleting.",
      parameters: {
        type: "object",
        properties: {
          expense_id: {
            type: "integer",
            description: "The ID of the expense to delete. Must first use list_expenses to find the expense ID."
          }
        },
        required: ["expense_id"]
      }
    }
  },
  run: async (args, token) => {
    // Optional: Get expense details first to confirm it exists and belongs to user
    try {
      const expense = await backendClient.get(`/expenses/${args.expense_id}`, {}, token);
      
      if (!expense) {
        throw new Error(`Expense with ID ${args.expense_id} not found.`);
      }
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`Expense with ID ${args.expense_id} not found or does not belong to you.`);
      }
      throw error;
    }
    
    // Proceed with deletion
    return await backendClient.delete(`/expenses/${args.expense_id}`, token);
  }
};
