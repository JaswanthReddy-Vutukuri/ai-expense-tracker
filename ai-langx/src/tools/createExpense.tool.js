/**
 * CREATE EXPENSE TOOL - LangChain StructuredTool Implementation
 * 
 * PURPOSE:
 * - Wraps backend create expense API in LangChain tool format
 * - Demonstrates StructuredTool pattern with Zod validation
 * - Shows how to inject request context into tools
 * 
 * LANGCHAIN CONCEPTS DEMONSTRATED:
 * ✅ StructuredTool base class
 * ✅ Zod schema for type-safe validation
 * ✅ Async _call() method implementation
 * ✅ Error handling within tool
 * ✅ Context injection (authToken, userId)
 * 
 * COMPARE WITH: ai/src/mcp/tools/createExpense.js
 * 
 * KEY DIFFERENCES:
 * - Zod schema (declarative) vs manual validation
 * - Class-based vs object-based
 * - Automatic schema conversion for OpenAI
 * - Built-in error handling
 */

import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from 'axios';
import { normalizeDateToISO } from '../utils/dateNormalizer.js';
import { findCategoryByName } from '../utils/categoryCache.js';
import { normalizeCategory, validateAmount, validateDescription } from '../validators/expenseValidator.js';

/**
 * Zod Schema for Create Expense Arguments
 * 
 * WHY ZOD:
 * - Type-safe validation at runtime
 * - Automatic OpenAI function schema generation
 * - Clear, declarative syntax
 * - Better error messages than JSON Schema
 * 
 * Compare with custom implementation's manual JSON Schema validation
 */
const CreateExpenseSchema = z.object({
  amount: z
    .number()
    .positive()
    .describe("Amount in numbers only (e.g., 200, 50.5)"),
  
  category: z
    .string()
    .min(1)
    .describe("Category name from user's message (e.g., lunch, coffee, groceries)"),
  
  description: z
    .string()
    .default("")
    .describe("Optional description"),
  
  date: z
    .string()
    .optional()
    .describe("Date (today, yesterday, or YYYY-MM-DD)")
});

/**
 * CreateExpenseTool - LangChain StructuredTool
 * 
 * ARCHITECTURE NOTE:
 * This tool maintains the MCP pattern: LLM extracts args → Tool validates → Backend executes
 * The LLM never directly calls the backend - it always goes through this validated wrapper
 */
export class CreateExpenseTool extends StructuredTool {
  /**
   * Tool name - used by LLM to identify this tool
   * MUST match OpenAI function calling convention
   */
  name = "create_expense";
  
  /**
   * Tool description - helps LLM understand when to use this tool
   * Should be clear and specific
   */
  description = "Add a new expense to the database. Use when user wants to add/create/record an expense. Required: amount (number) and category (string).";
  
  /**
   * Zod schema - automatic validation and OpenAI schema conversion
   */
  schema = CreateExpenseSchema;
  
  /**
   * Constructor - inject request-specific context
   * 
   * PATTERN NOTE:
   * In LangChain, tools are instantiated per-request with context
   * This allows the same tool class to be used across users/sessions
   * 
   * @param {string} authToken - JWT token for backend authentication
   * @param {Object} context - Request context (userId, traceId, etc.)
   */
  constructor(authToken, context = {}) {
    super();
    this.authToken = authToken;
    this.context = context;
    this.backendUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3000';
  }
  
  /**
   * Tool execution method
   * 
   * LANGCHAIN REQUIREMENT:
   * Must implement _call() method that takes validated arguments
   * 
   * AUTOMATIC FEATURES:
   * ✅ Arguments already validated by Zod
   * ✅ Execution traced by LangSmith
   * ✅ Errors caught by LangChain callbacks
   * 
   * @param {Object} args - Validated expense data
   * @returns {Promise<string>} Success message or error
   */
  async _call(args) {
    try {
      console.log('[CreateExpenseTool] Executing with args:', {
        ...args,
        userId: this.context.userId,
        traceId: this.context.traceId
      });
      
      // STEP 1: Validate and normalize data (same pattern as ai/)
      console.log('[CreateExpenseTool] Validating amount...');
      const validatedAmount = validateAmount(args.amount);
      
      console.log('[CreateExpenseTool] Normalizing category...');
      const normalizedCategory = normalizeCategory(args.category);
      
      console.log('[CreateExpenseTool] Normalizing date...');
      const normalizedDate = normalizeDateToISO(args.date || 'today');
      
      console.log('[CreateExpenseTool] Validating description...');
      const validatedDescription = validateDescription(args.description || '');
      
      console.log('[CreateExpenseTool] Normalized values:', {
        amount: validatedAmount,
        category: normalizedCategory,
        date: normalizedDate,
        description: validatedDescription
      });
      
      // STEP 2: Fetch category ID from backend (using cache)
      console.log('[CreateExpenseTool] Fetching category from backend...');
      const matchedCategory = await findCategoryByName(normalizedCategory, this.authToken);
      
      if (!matchedCategory) {
        const errorMsg = `Category "${normalizedCategory}" not found in backend. Please use one of: Food, Transport, Entertainment, Shopping, Bills, Health, Other`;
        console.error('[CreateExpenseTool]', errorMsg);
        throw new Error(errorMsg);
      }
      
      console.log('[CreateExpenseTool] Category matched:', {
        id: matchedCategory.id,
        name: matchedCategory.name
      });
      
      // STEP 3: Prepare backend payload with correct field names
      // Backend expects: { amount, category_id, description, date }
      const payload = {
        amount: validatedAmount,
        category_id: matchedCategory.id,  // Backend expects category_id (number)
        description: validatedDescription,
        date: normalizedDate              // Backend expects date (not expense_date)
      };
      
      console.log('[CreateExpenseTool] Sending payload to backend:', payload);
      
      // STEP 4: Call backend API
      const response = await axios.post(
        `${this.backendUrl}/api/expenses`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      
      // STEP 5: Return success message
      const expense = response.data;
      const successMessage = `✅ Successfully added expense: ₹${expense.amount} for ${expense.category_name} on ${expense.date}`;
      
      console.log('[CreateExpenseTool] Success:', successMessage);
      return successMessage;
      
    } catch (error) {
      // Error handling - log details and throw for LangChain to handle
      console.error('[CreateExpenseTool] Error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        traceId: this.context.traceId,
        stack: error.stack?.substring(0, 500)
      });
      
      // Return validation errors directly (will be shown to user by agent)
      if (error.message && !error.response) {
        // Validation error from our code
        return `❌ ${error.message}`;
      }
      
      // Classify HTTP errors for user-friendly messages
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 401 || status === 403) {
          return `❌ Authentication failed. Please log in again.`;
        }
        
        if (status === 400) {
          const backendMessage = data.message || data.error || 'Please check your input';
          return `❌ Invalid expense data: ${backendMessage}`;
        }
        
        if (status === 500) {
          return `❌ Server error. Please try again later.`;
        }
        
        return `❌ Failed to create expense (HTTP ${status}): ${data.message || error.message}`;
      }
      
      if (error.code === 'ECONNREFUSED') {
        return `❌ Cannot connect to expense tracker backend. Is the server running?`;
      }
      
      if (error.code === 'ETIMEDOUT') {
        return `❌ Request timed out. Please try again.`;
      }
      
      // Generic error
      return `❌ Failed to create expense: ${error.message}`;
    }
  }
}

/**
 * LEARNING NOTES:
 * 
 * 1. STRUCTURED TOOL PATTERN:
 *    - Extend StructuredTool base class
 *    - Define name, description, schema
 *    - Implement async _call(args)
 * 
 * 2. ZOD VALIDATION:
 *    - Declarative schema definition
 *    - Automatic runtime validation
 *    - Type inference for TypeScript
 *    - Better error messages
 * 
 * 3. CONTEXT INJECTION:
 *    - Constructor receives request context
 *    - Allows per-request customization
 *    - Maintains user isolation
 * 
 * 4. ERROR HANDLING:
 *    - Try/catch in _call()
 *    - Classify errors for user-friendly messages
 *    - Log errors with context
 * 
 * 5. COMPARISON WITH CUSTOM:
 *    Custom (ai/src/mcp/tools/createExpense.js):
 *    - Plain object with definition + run function
 *    - Manual JSON Schema validation
 *    - Context passed to executeTool()
 *    
 *    LangChain (this file):
 *    - Class extends StructuredTool
 *    - Zod schema with automatic validation
 *    - Context injected in constructor
 * 
 * 6. WHEN TO USE LANGCHAIN TOOLS:
 *    ✅ Want type safety (Zod + TypeScript)
 *    ✅ Need automatic OpenAI schema conversion
 *    ✅ Want built-in LangSmith tracing
 *    ✅ Integrating with LangChain agents
 *    
 *    ❌ Need absolute minimal dependencies
 *    ❌ Want 100% control over execution flow
 *    ❌ Custom validation logic too complex for Zod
 */
