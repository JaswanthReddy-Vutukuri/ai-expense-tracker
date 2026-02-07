import { backendClient } from '../../utils/backendClient.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('delete-expense-tool');

export const deleteExpenseTool = {
  definition: {
    type: "function",
    function: {
      name: "delete_expense",
      description: "Deletes an expense from the tracker. REQUIRES USER CONFIRMATION. First call without 'confirmed=true' to preview the expense details. Only call with 'confirmed=true' after user explicitly confirms deletion.",
      parameters: {
        type: "object",
        properties: {
          expense_id: {
            type: "integer",
            description: "The ID of the expense to delete. Must first use list_expenses to find the expense ID."
          },
          confirmed: {
            type: "boolean",
            description: "Set to true only after user has explicitly confirmed deletion. Leave false or omit for preview mode."
          }
        },
        required: ["expense_id"]
      }
    }
  },
  run: async (args, token) => {
    logger.info('delete_expense tool called', {
      expenseId: args.expense_id,
      confirmed: args.confirmed
    });
    
    // Get expense details first
    let expense;
    try {
      expense = await backendClient.get(`/expenses/${args.expense_id}`, {}, token);
      
      if (!expense) {
        throw new Error(`Expense with ID ${args.expense_id} not found.`);
      }
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`Expense with ID ${args.expense_id} not found or does not belong to you.`);
      }
      throw error;
    }
    
    // CONFIRMATION REQUIRED: If not confirmed, return preview
    if (!args.confirmed) {
      logger.info('Deletion requires confirmation - returning preview', {
        expenseId: args.expense_id
      });
      
      return {
        status: 'confirmation_required',
        message: `⚠️ DELETION CONFIRMATION REQUIRED\n\nExpense to be deleted:\n- Amount: $${expense.amount}\n- Category: ${expense.category_name}\n- Description: ${expense.description}\n- Date: ${expense.date}\n- ID: ${expense.id}\n\nThis action cannot be undone.\n\nDo you want to proceed? Reply 'yes' to confirm or 'no' to cancel.`,
        expense_preview: {
          id: expense.id,
          amount: expense.amount,
          category: expense.category_name,
          description: expense.description,
          date: expense.date
        },
        pending_action: {
          tool: 'delete_expense',
          arguments: {
            expense_id: args.expense_id,
            confirmed: true
          },
          instruction: 'When user confirms (says yes/ok/confirm), call delete_expense with these exact arguments'
        }
      };
    }
    
    // Confirmed - proceed with deletion
    logger.warn('Deleting expense after confirmation', {
      expenseId: args.expense_id,
      amount: expense.amount,
      description: expense.description
    });
    
    const result = await backendClient.delete(`/expenses/${args.expense_id}`, token);
    
    return {
      status: 'deleted',
      message: `Successfully deleted expense: $${expense.amount} - ${expense.description} (${expense.date})`,
      deleted_expense: expense
    };
  }
};
