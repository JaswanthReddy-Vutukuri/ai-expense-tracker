import { backendClient } from '../../utils/backendClient.js';
import { createLogger } from '../../utils/logger.js';
import { normalizeCategory } from '../../validators/expenseValidator.js';
import { findCategoryByName } from '../../utils/categoryCache.js';

const logger = createLogger('list-expenses-tool');

export const listExpensesTool = {
  definition: {
    type: "function",
    function: {
      name: "list_expenses",
      description: "Retrieves a list of expenses, optionally filtered by category or date range. Use this for queries like 'How much did I spend?' or 'Show my history'. Returns expenses with 'id' field that can be used for modify/delete operations.",
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
    logger.info('list_expenses tool called', { 
      hasCategory: !!args.category,
      hasDateRange: !!(args.startDate && args.endDate),
      hasToken: !!token,
      categoryName: args.category,
      limit: args.limit
    });
    
    // Convert category name to category_id (backend expects numeric ID)
    const queryParams = {
      startDate: args.startDate,
      endDate: args.endDate,
      limit: args.limit || 10, // Default to 10 if not specified
      page: args.page || 1,
      sortBy: args.sortBy,
      sortOrder: args.sortOrder
    };
    
    if (args.category) {
      const normalizedCategory = normalizeCategory(args.category);
      logger.debug('Category normalized', { original: args.category, normalized: normalizedCategory });
      
      const matchedCategory = await findCategoryByName(normalizedCategory, token);
      
      if (matchedCategory) {
        queryParams.category_id = matchedCategory.id;
        logger.info('Category matched', { 
          categoryName: normalizedCategory, 
          categoryId: matchedCategory.id 
        });
      } else {
        logger.warn('Category not found, listing all expenses', { 
          categoryName: normalizedCategory 
        });
        // Don't throw error, just list all expenses (user might have misspelled)
      }
    }
    
    const response = await backendClient.get('/expenses', queryParams, token);
    
    // Backend returns paginated format: { data: [...], total: N, page: 1, limit: 10 }
    // Extract the expenses array for the LLM
    if (response && response.data) {
      logger.info('list_expenses successful', { 
        count: response.data.length,
        total: response.total 
      });
      
      // Return both the expenses and metadata
      return {
        expenses: response.data,
        total: response.total,
        showing: response.data.length
      };
    }
    
    // Fallback if backend returns array directly (non-paginated)
    logger.info('list_expenses successful', { count: response?.length || 0 });
    return { expenses: response || [], total: response?.length || 0, showing: response?.length || 0 };
  }
};
