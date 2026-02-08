/**
 * CLEAR EXPENSES TOOL - LangChain StructuredTool Implementation
 * 
 * PURPOSE:
 * - Bulk delete expenses with optional filtering
 * - Demonstrates batch operations with TWO-STEP CONFIRMATION pattern
 * - Shows advanced filtering logic
 * 
 * COMPARE WITH: ai/src/mcp/tools/clearExpenses.js
 * 
 * CONFIRMATION WORKFLOW:
 * Step 1: Call without 'confirmed=true' → Returns preview with pending_action
 * Step 2: User confirms → Call with 'confirmed=true' → Executes deletion
 */

import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from 'axios';
import { normalizeCategory } from '../validators/expenseValidator.js';
import { findCategoryByName } from '../utils/categoryCache.js';

const ClearExpensesSchema = z.object({
  startDate: z
    .string()
    .optional()
    .describe("Start date filter in YYYY-MM-DD format"),
  
  endDate: z
    .string()
    .optional()
    .describe("End date filter in YYYY-MM-DD format"),
  
  category: z
    .string()
    .optional()
    .describe("Category filter - only delete expenses in this category"),
  
  confirmed: z
    .boolean()
    .optional()
    .describe("Set to true only AFTER user has explicitly confirmed deletion. Leave false or omit for preview mode.")
});

export class ClearExpensesTool extends StructuredTool {
  name = "clear_expenses";
  
  description = "Deletes multiple expenses at once. REQUIRES USER CONFIRMATION. First call without 'confirmed=true' to preview matching expenses. Only call with 'confirmed=true' after user explicitly confirms deletion.";
  
  schema = ClearExpensesSchema;
  
  constructor(authToken, context = {}) {
    super();
    this.authToken = authToken;
    this.context = context;
    this.backendUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3000';
  }
  
  async _call(args) {
    try {
      console.log('[ClearExpensesTool] Called with:', {
        hasStartDate: !!args.startDate,
        hasEndDate: !!args.endDate,
        hasCategory: !!args.category,
        confirmed: args.confirmed,
        traceId: this.context.traceId
      });
      
      // Build query parameters to list matching expenses
      const queryParams = {
        limit: 1000  // Get all matching expenses
      };
      
      if (args.startDate) queryParams.startDate = args.startDate;
      if (args.endDate) queryParams.endDate = args.endDate;
      
      // Convert category name to category_id if provided
      if (args.category) {
        const normalizedCategory = normalizeCategory(args.category);
        const matchedCategory = await findCategoryByName(normalizedCategory, this.authToken);
        
        if (matchedCategory) {
          queryParams.category_id = matchedCategory.id;
        }
      }
      
      // Fetch expenses that match the criteria
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });
      
      const listUrl = `${this.backendUrl}/api/expenses${params.toString() ? '?' + params.toString() : ''}`;
      console.log('[ClearExpensesTool] Fetching expenses:', listUrl);
      
      const response = await axios.get(listUrl, {
        headers: { 'Authorization': `Bearer ${this.authToken}` },
        timeout: 30000
      });
      
      const expenses = response.data.data || [];
      
      console.log('[ClearExpensesTool] Found', expenses.length, 'expenses to delete');
      
      if (expenses.length === 0) {
        return JSON.stringify({
          status: 'no_match',
          message: "No expenses found matching the criteria.",
          deleted_count: 0
        });
      }
      
      // STEP 1: PREVIEW MODE (no confirmation yet)
      if (!args.confirmed) {
        const totalAmount = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        const preview = expenses.slice(0, 10).map(e => 
          `- ₹${e.amount} - ${e.description || e.category_name} (${e.date})`
        ).join('\n');
        const moreText = expenses.length > 10 ? `\n... and ${expenses.length - 10} more` : '';
        
        console.log('[ClearExpensesTool] Returning preview for confirmation');
        
        return JSON.stringify({
          status: 'confirmation_required',
          message: `⚠️ DELETION CONFIRMATION REQUIRED\n\n${expenses.length} expense(s) will be deleted:\n${preview}${moreText}\n\nTotal Amount: ₹${totalAmount.toFixed(2)}\n\nThis action cannot be undone.\n\nDo you want to proceed? Reply 'yes' to confirm or 'no' to cancel.`,
          expense_count: expenses.length,
          total_amount: totalAmount,
          preview: expenses.slice(0, 10).map(e => ({
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
        });
      }
      
      // STEP 2: CONFIRMED - Execute deletion
      console.warn('[ClearExpensesTool] EXECUTING DELETION after confirmation:', {
        expenseCount: expenses.length,
        expenseIds: expenses.map(e => e.id)
      });
      
      // Delete each expense individually
      const deletePromises = expenses.map(expense => 
        axios.delete(
          `${this.backendUrl}/api/expenses/${expense.id}`,
          {
            headers: { 'Authorization': `Bearer ${this.authToken}` },
            timeout: 30000
          }
        )
        .then(() => ({ id: expense.id, success: true }))
        .catch(error => ({ id: expense.id, success: false, error: error.message }))
      );
      
      const results = await Promise.all(deletePromises);
      const successfulDeletes = results.filter(r => r.success);
      const failedDeletes = results.filter(r => !r.success);
      
      console.log('[ClearExpensesTool] Deletion complete:', {
        successful: successfulDeletes.length,
        failed: failedDeletes.length
      });
      
      return JSON.stringify({
        status: 'deleted',
        message: `✅ Successfully deleted ${successfulDeletes.length} expense(s).`,
        deleted_count: successfulDeletes.length,
        failed_count: failedDeletes.length,
        deleted_ids: successfulDeletes.map(r => r.id),
        ...(failedDeletes.length > 0 && {
          failed_ids: failedDeletes.map(r => ({ id: r.id, error: r.error }))
        })
      });
      
    } catch (error) {
      console.error('[ClearExpensesTool] Error:', {
        message: error.message,
        status: error.response?.status,
        traceId: this.context.traceId
      });
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        return `❌ Authentication failed.`;
      }
      
      return `❌ Failed to clear expenses: ${error.message}`;
    }
  }
}

/**
 * LEARNING NOTE - BATCH OPERATIONS:
 * 
 * Bulk operations need extra safety:
 * 1. ✅ Require explicit confirmation (args.confirm)
 * 2. ✅ Log with DANGER markers
 * 3. ✅ Support filtering (never delete ALL without filters)
 * 4. ✅ Return count of affected items
 * 5. ✅ Consider dry-run mode in production
 * 
 * In LangChain context:
 * - Agent might call this tool after user says "yes" to confirmation
 * - System prompt should guide LLM to ask for confirmation first
 * - Consider adding confirmation workflow in LangGraph
 */
