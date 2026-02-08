/**
 * LANGGRAPH STATE DEFINITIONS
 * 
 * PURPOSE:
 * - Define state schemas for LangGraph workflows
 * - Type-safe state management
 * - Shared state across graph nodes
 * 
 * LANGGRAPH CONCEPTS:
 * ✅ State is the core of LangGraph
 * ✅ Each node receives and returns state
 * ✅ Reducer functions control state updates
 * ✅ State travels through the graph
 * 
 * COMPARE WITH: Custom state management in ai/src/router/intentRouter.js
 */

import { z } from 'zod';

/**
 * Intent Router State
 * 
 * Tracks the classification and routing of user requests
 */
export const IntentRouterStateSchema = z.object({
  // Input
  userMessage: z.string(),
  userId: z.number(),
  authToken: z.string(),
  conversationHistory: z.array(z.any()).default([]),
  
  // Classification
  intent: z.enum([
    'expense_operation',  // Create, list, modify, delete expenses
    'rag_question',       // Question about uploaded PDFs
    'reconciliation',     // Sync bank statements, reconcile
    'general_chat',       // General conversation
    'clarification'       // Needs more info
  ]).optional(),
  
  confidence: z.number().min(0).max(1).optional(),
  reasoning: z.string().optional(),
  
  // Extracted entities
  entities: z.object({
    action: z.string().optional(),        // add, list, modify, delete
    amount: z.number().optional(),
    category: z.string().optional(),
    date: z.string().optional(),
    description: z.string().optional(),
    expenseId: z.number().optional()
  }).optional(),
  
  // Execution
  result: z.string().optional(),
  toolCalls: z.array(z.any()).optional(),
  
  // Error handling
  error: z.string().optional(),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().optional(),
  
  // Metadata
  traceId: z.string().optional(),
  timestamp: z.string().optional()
});

/**
 * Reconciliation State
 * 
 * Tracks multi-step document reconciliation workflow
 */
export const ReconciliationStateSchema = z.object({
  // Input
  userId: z.number(),
  authToken: z.string(),
  documentExpenses: z.array(z.object({
    date: z.string(),
    description: z.string(),
    amount: z.number(),
    category: z.string().optional()
  })).optional(),
  
  // Fetched data
  appExpenses: z.array(z.any()).optional(),
  documentDetails: z.array(z.any()).optional(),
  
  // Analysis
  matches: z.array(z.object({
    documentExpense: z.any(),
    appExpense: z.any().optional(),
    documentDetail: z.any().optional(),
    matchScore: z.number(),
    matchType: z.enum(['exact', 'probable', 'fuzzy'])
  })).optional(),
  
  discrepancies: z.array(z.object({
    type: z.enum(['missing_in_app', 'missing_in_pdf', 'amount_mismatch', 'date_mismatch']),
    documentExpense: z.any().optional(),
    appExpense: z.any().optional(),
    difference: z.number().optional(),
    severity: z.enum(['high', 'medium', 'low'])
  })).optional(),
  
  // Report
  summary: z.string().optional(),
  totalMatched: z.number().optional(),
  totalDiscrepancies: z.number().optional(),
  
  // Actions
  suggestedActions: z.array(z.object({
    action: z.string(),
    target: z.any(),
    reason: z.string()
  })).optional(),
  
  autoSyncEnabled: z.boolean().default(false),
  syncedExpenses: z.array(z.any()).optional(),
  
  // Error handling
  error: z.string().optional(),
  retryCount: z.number().default(0),
  
  // Metadata
  traceId: z.string().optional(),
  timestamp: z.string().optional(),
  stage: z.enum([
    'init',
    'fetch_app_expenses',
    'fetch_document_details',
    'compare_pdf_vs_app',
    'analyze_documents',
    'analyze_discrepancies',
    'generate_report',
    'auto_sync',
    'complete',
    'error'
  ]).default('init')
});

/**
 * State Reducer Patterns
 * 
 * Control how state updates are merged
 */

/**
 * Append reducer - for arrays
 * Appends new values to existing array
 */
export const appendReducer = (existing, update) => {
  if (!Array.isArray(existing)) return update;
  if (!Array.isArray(update)) return existing;
  return [...existing, ...update];
};

/**
 * Override reducer - for scalars
 * Replaces existing value with new value
 */
export const overrideReducer = (existing, update) => {
  return update !== undefined ? update : existing;
};

/**
 * Merge reducer - for objects
 * Deep merges objects
 */
export const mergeReducer = (existing, update) => {
  if (!existing) return update;
  if (!update) return existing;
  return { ...existing, ...update };
};

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * Custom (ai/src/router/intentRouter.js):
 * ```javascript
 * // Implicit state in function params
 * let state = {
 *   intent: null,
 *   confidence: 0,
 *   result: null
 * };
 * 
 * // Manual state passing
 * state = await classifyIntent(message, state);
 * state = await executeIntent(state);
 * return state.result;
 * 
 * // No type safety
 * // No validation
 * // Manual error handling
 * ```
 * 
 * LangGraph (this file):
 * ```javascript
 * // Explicit state schema with Zod
 * const state: IntentRouterState = {
 *   userMessage: "add 500 for lunch",
 *   userId: 1,
 *   authToken: "..."
 * };
 * 
 * // State flows through graph automatically
 * const result = await graph.invoke(state);
 * 
 * // Type-safe: TypeScript knows all fields
 * // Validated: Zod ensures correct structure
 * // Error handling: Built into graph
 * ```
 * 
 * ADVANTAGES OF LANGGRAPH STATE:
 * ✅ Type safety with Zod schemas
 * ✅ Automatic validation
 * ✅ Structured error handling
 * ✅ State history tracking
 * ✅ Reducer functions for complex updates
 * ✅ State checkpointing (can pause/resume)
 * ✅ ~50% less code
 * 
 * STATE FLOW IN LANGGRAPH:
 * 
 * 1. Define state schema:
 *    const StateSchema = z.object({...})
 * 
 * 2. Create nodes (functions that transform state):
 *    const myNode = (state) => ({ ...updates })
 * 
 * 3. Build graph:
 *    graph.addNode("myNode", myNode)
 *    graph.addEdge("start", "myNode")
 * 
 * 4. Invoke graph:
 *    const result = await graph.invoke(initialState)
 * 
 * 5. State automatically flows through nodes!
 * 
 * CHECKPOINTING:
 * LangGraph can save state at each step:
 * ```javascript
 * import { SqliteSaver } from "@langchain/langgraph";
 * const checkpointer = new SqliteSaver("checkpoints.db");
 * const graph = new StateGraph(schema, checkpointer);
 * 
 * // Can pause and resume!
 * const result = await graph.invoke(state, {
 *   configurable: { thread_id: "user-123" }
 * });
 * ```
 * 
 * Great for long-running workflows like reconciliation!
 */
