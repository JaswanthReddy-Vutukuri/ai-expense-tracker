/**
 * TRANSACTIONAL HANDLER
 * 
 * Purpose:
 * - Handles expense CRUD operations via natural language
 * - Delegates to existing MCP tools
 * - Wraps the existing agent.js functionality
 * 
 * Why it exists:
 * - Separates transactional logic from other intents
 * - Provides clean interface for expense operations
 * - Maintains backward compatibility with existing implementation
 * 
 * Architecture fit:
 * - Called by intent router when intent = TRANSACTIONAL
 * - Uses existing LLM agent with tool-calling
 * - Returns natural language response
 */

import { processChatMessage } from '../llm/agent.js';

/**
 * Handles transactional expense operations
 * @param {string} userMessage - User's natural language request
 * @param {string} authToken - JWT token for backend authentication
 * @param {Array} history - Optional conversation history for context
 * @returns {Promise<string>} Natural language response
 */
export const handleTransactional = async (userMessage, authToken, history = []) => {
  console.log('[Transactional Handler] Processing expense operation');
  
  try {
    // Delegate to existing agent implementation with conversation history
    const response = await processChatMessage(userMessage, authToken, history);
    return response;
  } catch (error) {
    console.error('[Transactional Handler] Error:', error.message);
    throw error;
  }
};
