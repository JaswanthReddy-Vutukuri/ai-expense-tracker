import { backendClient } from '../../utils/backendClient.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('clear-expenses-tool');

export const clearExpensesTool = {
  definition: {
    type: "function",
    function: {
      name: "clear_expenses",
      description: "Deletes multiple expenses at once. REQUIRES USER CONFIRMATION. First call without 'confirmed=true' to preview matching expenses. Only call with 'confirmed=true' after user explicitly confirms deletion.",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            format: "date",
            description: "Start date filter in YYYY-MM-DD format. Only expenses on or after this date will be deleted. Optional - if not provided, no lower date bound."
          },
          endDate: {
            type: "string",
            format: "date",
            description: "End date filter in YYYY-MM-DD format. Only expenses on or before this date will be deleted. Optional - if not provided, no upper date bound."
          },
          category: {
            type: "string",
            description: "Category filter. Only expenses in this category will be deleted. Optional - if not provided, expenses from all categories."
          },
          confirmed: {
            type: "boolean",
            description: "Set to true only after user has explicitly confirmed deletion. Leave false or omit for preview mode."
          }
        },
        required: []
      }
    }
  },
  run: async (args, token) => {
    logger.info('clear_expenses tool called', {
      hasStartDate: !!args.startDate,
      hasEndDate: !!args.endDate,
      hasCategory: !!args.category,
      startDate: args.startDate,
      endDate: args.endDate,
      category: args.category,
      confirmed: args.confirmed
    });
    
    // First, list all expenses matching the criteria
    const params = { limit: 1000 };
    
    // CRITICAL: Backend expects 'startDate' and 'endDate' (camelCase), not snake_case
    if (args.startDate) params.startDate = args.startDate;
    if (args.endDate) params.endDate = args.endDate;
    if (args.category) params.category = args.category;
    
    logger.info('Fetching expenses to delete', { params });
    
    // Backend returns paginated response: { data: [...], total, page, limit }
    const response = await backendClient.get('/expenses', params, token);
    
    // Extract expenses array from paginated response
    const expenses = response?.data || response || [];
    
    logger.info('Expenses fetched for deletion', { 
      count: expenses.length,
      total: response?.total,
      filters: params 
    });
    
    if (!Array.isArray(expenses) || expenses.length === 0) {
      return {
        status: 'no_match',
        message: "No expenses found matching the criteria.",
        deleted_count: 0
      };
    }
    
    // CONFIRMATION REQUIRED: If not confirmed, return preview
    if (!args.confirmed) {
      logger.info('Deletion requires confirmation - returning preview', {
        expenseCount: expenses.length,
        filters: params
      });
      
      const totalAmount = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
      const preview = expenses.slice(0, 10).map(e => `- $${e.amount} - ${e.description} (${e.date})`).join('\n');
      const moreText = expenses.length > 10 ? `\n... and ${expenses.length - 10} more` : '';
      
      return {
        status: 'confirmation_required',
        message: `⚠️ DELETION CONFIRMATION REQUIRED\n\n${expenses.length} expense(s) will be deleted:\n${preview}${moreText}\n\nTotal Amount: $${totalAmount.toFixed(2)}\n\nThis action cannot be undone.\n\nDo you want to proceed? Reply 'yes' to confirm or 'no' to cancel.`,
        expense_count: expenses.length,
        total_amount: totalAmount,
        preview: expenses.map(e => ({
          id: e.id,
          amount: e.amount,
          category: e.category_name,
          description: e.description,
          date: e.date
        })),
        pending_action: {
          tool: 'clear_expenses',
          arguments: {
            ...args,
            confirmed: true
          },
          instruction: 'When user confirms (says yes/ok/confirm), call clear_expenses with these exact arguments'
        }
      };
    }
    
    // Confirmed - proceed with deletion
    logger.warn(`Deleting ${expenses.length} expenses after confirmation`, {
      expenseIds: expenses.map(e => e.id),
      filters: params
    });
    
    // Delete each expense
    const deletePromises = expenses.map(expense => 
      backendClient.delete(`/expenses/${expense.id}`, token)
        .then(() => ({ id: expense.id, success: true }))
        .catch(error => ({ id: expense.id, success: false, error: error.message }))
    );
    
    const results = await Promise.all(deletePromises);
    const successfulDeletes = results.filter(r => r.success);
    const failedDeletes = results.filter(r => !r.success);
    
    return {
      status: 'deleted',
      message: `Successfully deleted ${successfulDeletes.length} expense(s).`,
      deleted_count: successfulDeletes.length,
      failed_count: failedDeletes.length,
      deleted_ids: successfulDeletes.map(r => r.id),
      ...(failedDeletes.length > 0 && {
        failed_ids: failedDeletes.map(r => ({ id: r.id, error: r.error }))
      })
    };
  }
};
