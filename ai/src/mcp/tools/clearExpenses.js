import { backendClient } from '../../utils/backendClient.js';

export const clearExpensesTool = {
  definition: {
    type: "function",
    function: {
      name: "clear_expenses",
      description: "Deletes multiple expenses at once. Use this when the user wants to clear/delete all expenses or expenses matching certain criteria (date range, category, etc.). IMPORTANT: Always list the expenses to be deleted and get implicit confirmation before clearing.",
      parameters: {
        type: "object",
        properties: {
          date_from: {
            type: "string",
            format: "date",
            description: "Start date filter in YYYY-MM-DD format. Only expenses on or after this date will be deleted. Optional - if not provided, no lower date bound."
          },
          date_to: {
            type: "string",
            format: "date",
            description: "End date filter in YYYY-MM-DD format. Only expenses on or before this date will be deleted. Optional - if not provided, no upper date bound."
          },
          category: {
            type: "string",
            description: "Category filter. Only expenses in this category will be deleted. Optional - if not provided, expenses from all categories."
          }
        },
        required: []
      }
    }
  },
  run: async (args, token) => {
    // First, list all expenses matching the criteria
    const params = {};
    if (args.date_from) params.start_date = args.date_from;
    if (args.date_to) params.end_date = args.date_to;
    if (args.category) params.category = args.category;
    
    const expenses = await backendClient.get('/expenses', params, token);
    
    if (!expenses || expenses.length === 0) {
      return {
        message: "No expenses found matching the criteria.",
        deleted_count: 0
      };
    }
    
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
