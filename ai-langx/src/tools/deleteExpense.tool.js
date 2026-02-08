/**
 * DELETE EXPENSE TOOL - LangChain StructuredTool Implementation
 * 
 * PURPOSE:
 * - Deletes a single expense by ID with TWO-STEP CONFIRMATION
 * - Demonstrates destructive operation with preview pattern
 * - Shows error handling for non-existent resources
 * 
 * COMPARE WITH: ai/src/mcp/tools/deleteExpense.js
 * 
 * CONFIRMATION WORKFLOW:
 * Step 1: Call without 'confirmed=true' → Returns expense preview with pending_action
 * Step 2: User confirms → Call with 'confirmed=true' → Executes deletion
 */

import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from 'axios';

const DeleteExpenseSchema = z.object({
  expense_id: z
    .number()
    .int()
    .positive("Expense ID must be a positive integer")
    .describe("The ID of the expense to delete (get from list_expenses first)"),
  
  confirmed: z
    .boolean()
    .optional()
    .describe("Set to true only AFTER user has explicitly confirmed deletion. Leave false or omit for preview mode.")
});

export class DeleteExpenseTool extends StructuredTool {
  name = "delete_expense";
  
  description = "Deletes an expense from the tracker. REQUIRES USER CONFIRMATION. First call without 'confirmed=true' to preview the expense details. Only call with 'confirmed=true' after user explicitly confirms deletion.";
  
  schema = DeleteExpenseSchema;
  
  constructor(authToken, context = {}) {
    super();
    this.authToken = authToken;
    this.context = context;
    this.backendUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3000';
  }
  
  async _call(args) {
    try {
      console.log('[DeleteExpenseTool] Called:', {
        expenseId: args.expense_id,
        confirmed: args.confirmed,
        traceId: this.context.traceId
      });
      
      // Fetch expense details first
      let expense;
      try {
        const response = await axios.get(
          `${this.backendUrl}/api/expenses/${args.expense_id}`,
          {
            headers: { 'Authorization': `Bearer ${this.authToken}` },
            timeout: 30000
          }
        );
        expense = response.data;
        
        if (!expense) {
          return JSON.stringify({
            error: `Expense with ID ${args.expense_id} not found.`
          });
        }
      } catch (error) {
        if (error.response?.status === 404) {
          return JSON.stringify({
            error: `Expense with ID ${args.expense_id} not found or does not belong to you.`
          });
        }
        throw error;
      }
      
      // STEP 1: PREVIEW MODE (no confirmation yet)
      if (!args.confirmed) {
        console.log('[DeleteExpenseTool] Returning preview for confirmation');
        
        return JSON.stringify({
          status: 'confirmation_required',
          message: `⚠️ DELETION CONFIRMATION REQUIRED\n\nExpense to be deleted:\n- Amount: ₹${expense.amount}\n- Category: ${expense.category_name}\n- Description: ${expense.description}\n- Date: ${expense.date}\n- ID: ${expense.id}\n\nThis action cannot be undone.\n\nDo you want to proceed? Reply 'yes' to confirm or 'no' to cancel.`,
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
        });
      }
      
      // STEP 2: CONFIRMED - Execute deletion
      console.warn('[DeleteExpenseTool] EXECUTING DELETION after confirmation:', {
        expenseId: args.expense_id,
        amount: expense.amount,
        description: expense.description
      });
      
      await axios.delete(
        `${this.backendUrl}/api/expenses/${args.expense_id}`,
        {
          headers: { 'Authorization': `Bearer ${this.authToken}` },
          timeout: 30000
        }
      );
      
      return JSON.stringify({
        status: 'deleted',
        message: `✅ Successfully deleted expense: ₹${expense.amount} - ${expense.description} (${expense.date})`,
        deleted_expense: expense
      });
      
    } catch (error) {
      console.error('[DeleteExpenseTool] Error:', {
        message: error.message,
        status: error.response?.status,
        traceId: this.context.traceId
      });
      
      if (error.response?.status === 404) {
        return `❌ Expense #${args.expense_id} not found. It may have already been deleted.`;
      }
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        return `❌ Authentication failed.`;
      }
      
      return `❌ Failed to delete expense: ${error.message}`;
    }
  }
}

/**
 * LEARNING NOTE - DESTRUCTIVE OPERATIONS:
 * 
 * When implementing tools that delete/clear data:
 * 1. ✅ Log the operation with context
 * 2. ✅ Provide clear error messages
 * 3. ✅ Consider confirmation patterns (system prompt)
 * 4. ✅ Document "cannot be undone" in description
 * 
 * In production, you might add:
 * - Soft delete (mark as deleted, don't remove)
 * - Audit trail (who deleted what when)
 * - Batch delete limits
 * - Rate limiting on delete operations
 */
