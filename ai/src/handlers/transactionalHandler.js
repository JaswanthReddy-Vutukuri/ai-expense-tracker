/**
 * TRANSACTIONAL HANDLER
 * 
 * Purpose:
 * - Handles expense CRUD operations via natural language
 * - Delegates to MCP tools through LLM agent orchestration
 * - Provides natural language interface to structured backend APIs
 * 
 * Why it exists:
 * - Separates transactional logic from other intents
 * - Provides clean interface for expense operations
 * - Maintains backward compatibility with existing implementation
 * - Implements MCP pattern for safe tool execution
 * 
 * Architecture fit:
 * - Called by intent router when intent = TRANSACTIONAL
 * - Uses LLM agent with tool-calling for dynamic execution
 * - Returns natural language response to user
 * 
 * Production Hardening:
 * --------------------
 * - Context propagation (traceId, userId) for observability
 * - All tool calls monitored and logged
 * - Errors classified and handled appropriately
 */

import { processChatMessage } from '../llm/agent.js';

/**
 * Handles transactional expense operations
 * 
 * @param {string} userMessage - User's natural language request
 * @param {string} authToken - JWT token for backend authentication
 * @param {Array} history - Optional conversation history for context
 * @param {Object} context - Request context (traceId, userId) for observability
 * @returns {Promise<string>} Natural language response
 */
export const handleTransactional = async (userMessage, authToken, history = [], context = {}) => {
  // Delegate to existing agent implementation with full context propagation
  // Context ensures traceability across LLM calls and tool executions
  const response = await processChatMessage(userMessage, authToken, history, context);
  return response;
};
