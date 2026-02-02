import { backendClient } from '../../utils/backendClient.js';

export const listExpensesTool = {
  definition: {
    type: "function",
    function: {
      name: "list_expenses",
      description: "Retrieves a list of expenses, optionally filtered by category or date range. Use this for queries like 'How much did I spend?' or 'Show my history'.",
      parameters: {
        type: "object",
        properties: {
          category: { 
            type: "string", 
            description: "Filter expenses by a specific category name." 
          },
          startDate: { 
            type: "string", 
            format: "date", 
            description: "Filter expenses after this date (inclusive) in YYYY-MM-DD format." 
          },
          endDate: { 
            type: "string", 
            format: "date", 
            description: "Filter expenses before this date (inclusive) in YYYY-MM-DD format." 
          }
        }
      }
    }
  },
  run: async (args, token) => {
    // Assuming backend /expenses GET accepts query params for filtering
    return await backendClient.get('/expenses', args, token);
  }
};
