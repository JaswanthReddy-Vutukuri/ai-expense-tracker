/**
 * MODIFY EXPENSE TOOL - LangChain StructuredTool Implementation
 * 
 * PURPOSE:
 * - Updates an existing expense in the backend
 * - Demonstrates partial updates (optional fields)
 * - Shows ID-based operations
 * 
 * COMPARE WITH: ai/src/mcp/tools/modifyExpense.js
 */

import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from 'axios';
import { validateAmount, normalizeCategory, validateDescription } from '../validators/expenseValidator.js';
import { findCategoryByName } from '../utils/categoryCache.js';
import { normalizeDateToISO } from '../utils/dateNormalizer.js';

const ModifyExpenseSchema = z.object({
  expense_id: z
    .number()
    .int()
    .positive("Expense ID must be a positive integer")
    .describe("The ID of the expense to modify (get from list_expenses first)"),
  
  amount: z
    .number()
    .positive()
    .optional()
    .describe("New expense amount"),
  
  category: z
    .string()
    .optional()
    .describe("New category"),
  
  description: z
    .string()
    .optional()
    .describe("New description"),
  
  date: z
    .string()
    .optional()
    .describe("New date (YYYY-MM-DD)")
});

export class ModifyExpenseTool extends StructuredTool {
  name = "modify_expense";
  
  description = "Modifies an existing expense. Requires expense_id (from list_expenses). All other fields are optional - only provided fields will be updated.";
  
  schema = ModifyExpenseSchema;
  
  constructor(authToken, context = {}) {
    super();
    this.authToken = authToken;
    this.context = context;
    this.backendUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3000';
  }
  
  async _call(args) {
    try {
      console.log('[ModifyExpenseTool] Executing:', {
        expenseId: args.expense_id,
        updates: Object.keys(args).filter(k => k !== 'expense_id'),
        traceId: this.context.traceId
      });
      
      // STEP 1: Get current expense to preserve unchanged fields
      console.log('[ModifyExpenseTool] Fetching current expense...');
      const currentResponse = await axios.get(
        `${this.backendUrl}/api/expenses/${args.expense_id}`,
        {
          headers: {
            'Authorization': `Bearer ${this.authToken}`
          },
          timeout: 30000
        }
      );
      
      const currentExpense = currentResponse.data;
      if (!currentExpense) {
        return `❌ Expense #${args.expense_id} not found.`;
      }
      
      console.log('[ModifyExpenseTool] Current expense:', currentExpense);
      
      // STEP 2: Build update payload with validation/normalization
      const updates = {};
      
      // Amount - validate if provided, else keep current
      if (args.amount !== undefined) {
        updates.amount = validateAmount(args.amount);
      } else {
        updates.amount = currentExpense.amount;
      }
      
      // Description - validate if provided, else keep current
      if (args.description !== undefined) {
        updates.description = validateDescription(args.description);
      } else {
        updates.description = currentExpense.description;
      }
      
      // Date - normalize if provided, else keep current
      if (args.date !== undefined) {
        updates.date = normalizeDateToISO(args.date);
      } else {
        updates.date = currentExpense.date;
      }
      
      // Category - normalize and get ID if provided, else keep current
      if (args.category !== undefined) {
        const normalizedCategory = normalizeCategory(args.category);
        console.log('[ModifyExpenseTool] Category normalized:', { original: args.category, normalized: normalizedCategory });
        
        const matchedCategory = await findCategoryByName(normalizedCategory, this.authToken);
        
        if (!matchedCategory) {
          return `❌ Category "${normalizedCategory}" not found. Use: Food, Transport, Entertainment, Shopping, Bills, Health, Other`;
        }
        
        updates.category_id = matchedCategory.id;
        console.log('[ModifyExpenseTool] Category matched:', matchedCategory);
      } else {
        updates.category_id = currentExpense.category_id;
      }
      
      console.log('[ModifyExpenseTool] Sending updates to backend:', updates);
      
      // STEP 3: Call backend API with correct field names
      // Backend expects: { amount, category_id, description, date }
      const response = await axios.put(
        `${this.backendUrl}/api/expenses/${args.expense_id}`,
        updates,
        {
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      
      const updated = response.data;
      return `✅ Successfully updated expense #${updated.id}: ₹${updated.amount} for ${updated.category_name} on ${updated.date}`;
      
    } catch (error) {
      console.error('[ModifyExpenseTool] Error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        traceId: this.context.traceId
      });
      
      if (error.response?.status === 404) {
        return `❌ Expense #${args.expense_id} not found. It may have been deleted or doesn't belong to you.`;
      }
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        return `❌ Authentication failed.`;
      }
      
      return `❌ Failed to modify expense: ${error.message}`;
    }
  }
}
