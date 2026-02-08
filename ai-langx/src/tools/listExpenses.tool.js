/**
 * LIST EXPENSES TOOL - LangChain StructuredTool Implementation
 * 
 * PURPOSE:
 * - Retrieves expenses from backend with optional filtering
 * - Demonstrates tool with optional parameters
 * - Shows how to handle list/array responses
 * 
 * COMPARE WITH: ai/src/mcp/tools/listExpenses.js
 */

import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from 'axios';
import { normalizeCategory } from '../validators/expenseValidator.js';
import { findCategoryByName } from '../utils/categoryCache.js';

/**
 * Zod Schema for List Expenses Arguments
 * 
 * ALL PARAMETERS ARE OPTIONAL:
 * - Filters by date, category, or amount range
 * - If no filters, returns all user's expenses
 */
const ListExpensesSchema = z.object({
  category: z
    .string()
    .optional()
    .describe("Filter by category (e.g., 'Food', 'Transport')"),
  
  startDate: z
    .string()
    .optional()
    .describe("Filter expenses from this date (YYYY-MM-DD)"),
  
  endDate: z
    .string()
    .optional()
    .describe("Filter expenses until this date (YYYY-MM-DD)"),
  
  minAmount: z
    .number()
    .optional()
    .describe("Filter expenses with amount >= this value"),
  
  maxAmount: z
    .number()
    .optional()
    .describe("Filter expenses with amount <= this value")
});

export class ListExpensesTool extends StructuredTool {
  name = "list_expenses";
  
  description = "Retrieves expenses from the expense tracker. Can optionally filter by category, date range, or amount range. Use this when user wants to see, show, list, or view their expenses.";
  
  schema = ListExpensesSchema;
  
  constructor(authToken, context = {}) {
    super();
    this.authToken = authToken;
    this.context = context;
    this.backendUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3000';
  }
  
  async _call(args) {
    try {
      console.log('[ListExpensesTool] Executing with filters:', {
        ...args,
        userId: this.context.userId,
        traceId: this.context.traceId
      });
      
      // Build query parameters matching backend API
      const queryParams = {
        startDate: args.startDate,
        endDate: args.endDate,
        limit: 100,
        page: 1
      };
      
      // Convert category name to category_id (backend expects numeric ID)
      if (args.category) {
        const normalizedCategory = normalizeCategory(args.category);
        console.log('[ListExpensesTool] Category normalized:', { original: args.category, normalized: normalizedCategory });
        
        const matchedCategory = await findCategoryByName(normalizedCategory, this.authToken);
        
        if (matchedCategory) {
          queryParams.category_id = matchedCategory.id;
          console.log('[ListExpensesTool] Category matched:', { id: matchedCategory.id, name: matchedCategory.name });
        } else {
          console.warn('[ListExpensesTool] Category not found, listing all expenses');
        }
      }
      
      // Build URL with query params
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });
      
      const url = `${this.backendUrl}/api/expenses${params.toString() ? '?' + params.toString() : ''}`;
      console.log('[ListExpensesTool] Calling backend:', url);
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        },
        timeout: 30000
      });
      
      // Backend returns paginated format: { data: [...], total, page, limit }
      const expenses = response.data.data || [];
      
      console.log('[ListExpensesTool] Retrieved', expenses.length, 'expenses');
      
      // Format response for LLM
      if (expenses.length === 0) {
        return "No expenses found matching your criteria.";
      }
      
      // Return structured JSON for LLM to parse
      // Note: Backend returns 'date' field, not 'expense_date'
      return JSON.stringify({
        expenses: expenses.map(e => ({
          id: e.id,
          amount: e.amount,
          category: e.category_name,
          description: e.description,
          date: e.date
        })),
        total: response.data.total || expenses.length,
        showing: expenses.length
      }, null, 2);
      
    } catch (error) {
      console.error('[ListExpensesTool] Error:', {
        message: error.message,
        status: error.response?.status,
        traceId: this.context.traceId
      });
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        return `❌ Authentication failed.`;
      }
      
      if (error.code === 'ECONNREFUSED') {
        return `❌ Cannot connect to backend.`;
      }
      
      return `❌ Failed to list expenses: ${error.message}`;
    }
  }
}

/**
 * LEARNING NOTE - TOOL OUTPUT FORMATS:
 * 
 * Tools can return:
 * 1. Plain text: "Found 5 expenses totaling ₹500"
 * 2. Structured JSON: {count: 5, total: 500, expenses: [...]}
 * 3. Formatted tables/lists
 * 
 * LLM will parse any format, but structured JSON is recommended when:
 * - Output will be used by subsequent tools
 * - Need precise data extraction
 * - Building multi-step workflows
 * 
 * For end-user responses, LLM will convert to natural language anyway.
 */
