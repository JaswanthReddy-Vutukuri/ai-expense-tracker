/**
 * INTENT ROUTER (Agent-lite Pattern)
 * 
 * Purpose:
 * - Classifies incoming user messages into execution paths
 * - Routes requests to appropriate handlers
 * - Does NOT implement autonomous agent behavior
 * - Makes deterministic routing decisions
 * 
 * Why it exists:
 * - Separates intent classification from execution
 * - Enables different processing pipelines (TRANSACTIONAL vs RAG)
 * - Provides single decision point for observability
 * 
 * Architecture fit:
 * - Called by /ai/chat route
 * - Delegates to specialized handlers
 * - Maintains clean separation of concerns
 * 
 * Intent Types:
 * - TRANSACTIONAL: Add/modify/delete/list expenses using MCP tools
 * - RAG_QA: Answer questions from uploaded PDF documents
 * - RAG_COMPARE: Compare PDF expenses with app expenses
 * - CLARIFICATION: Ambiguous or out-of-scope requests
 */

import OpenAI from 'openai';

const openaiConfig = {
  apiKey: process.env.LLM_API_KEY
};
if (process.env.LLM_BASE_URL) {
  openaiConfig.baseURL = process.env.LLM_BASE_URL;
}
const openai = new OpenAI(openaiConfig);

/**
 * Intent classification prompt
 * Uses few-shot learning for accurate classification
 */
const getClassificationPrompt = (userMessage) => {
  return `You are an intent classifier for an expense tracker AI system.
Classify the user's message into ONE of these intents:

1. TRANSACTIONAL - User wants to add, modify, delete, or list expenses in the app
   Examples: "add 500 for lunch", "show my expenses", "delete expense 123", "update my last expense"

2. RAG_QA - User asks questions about their uploaded PDF expense statements
   Examples: "what did I spend on groceries according to my bank statement?", "summarize my credit card bill", "how much was the hotel charge in my PDF?"

3. RAG_COMPARE - User wants to compare PDF data with app data
   Examples: "compare my bank statement with my tracked expenses", "find differences between PDF and my records", "what expenses are in my PDF but not in my app?"

4. SYNC_RECONCILE - User wants to sync PDF expenses into the app or reconcile data
   Examples: "sync my PDF expenses", "reconcile expenses", "add missing expenses from PDF", "update app with PDF data", "sync and generate report"

5. CLARIFICATION - Ambiguous, greeting, or out-of-scope
   Examples: "hello", "what can you do?", "tell me a joke", unclear requests

User message: "${userMessage}"

Respond with ONLY the intent name (TRANSACTIONAL, RAG_QA, RAG_COMPARE, SYNC_RECONCILE, or CLARIFICATION). No explanation.`;
};

/**
 * Classifies user intent using LLM
 * @param {string} userMessage - The user's natural language input
 * @returns {Promise<string>} One of: TRANSACTIONAL, RAG_QA, RAG_COMPARE, CLARIFICATION
 */
export const classifyIntent = async (userMessage) => {
  try {
    console.log('[Intent Router] Classifying message:', userMessage.substring(0, 100));
    
    const response = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an intent classification system. Respond only with the intent name.' },
        { role: 'user', content: getClassificationPrompt(userMessage) }
      ],
      temperature: 0.1, // Low temperature for consistent classification
      max_tokens: 50
    });

    const intent = response.choices[0].message.content.trim().toUpperCase();
    
    // Validate intent
    const validIntents = ['TRANSACTIONAL', 'RAG_QA', 'RAG_COMPARE', 'SYNC_RECONCILE', 'CLARIFICATION'];
    if (!validIntents.includes(intent)) {
      console.warn(`[Intent Router] Invalid intent "${intent}", defaulting to CLARIFICATION`);
      return 'CLARIFICATION';
    }

    console.log(`[Intent Router] Classified as: ${intent}`);
    return intent;
  } catch (error) {
    console.error('[Intent Router] Classification error:', error.message);
    // Default to TRANSACTIONAL for backward compatibility
    return 'TRANSACTIONAL';
  }
};

/**
 * Rule-based fallback classification
 * Used when LLM classification fails or for quick detection
 */
export const quickClassify = (userMessage) => {
  const lower = userMessage.toLowerCase();
  
  // SYNC_RECONCILE keywords
  if (lower.includes('sync') || lower.includes('reconcile') || lower.includes('update app') ||
      lower.includes('add missing') || lower.includes('import from pdf')) {
    return 'SYNC_RECONCILE';
  }
  
  // RAG_COMPARE keywords
  if (lower.includes('compare') || lower.includes('difference') || lower.includes('vs ') || 
      lower.includes('versus') || lower.includes('match') || lower.includes('discrepancy')) {
    return 'RAG_COMPARE';
  }
  
  // RAG_QA keywords (references to documents)
  if (lower.includes('pdf') || lower.includes('statement') || lower.includes('document') ||
      lower.includes('uploaded') || lower.includes('according to') || lower.includes('in my file')) {
    return 'RAG_QA';
  }
  
  // Greetings/help
  if (lower.match(/^(hi|hello|hey|help|what can you)\b/)) {
    return 'CLARIFICATION';
  }
  
  // Default to TRANSACTIONAL
  return 'TRANSACTIONAL';
};

/**
 * Main routing function
 * Uses LLM classification for accurate intent detection
 * Falls back to rule-based classification on errors
 */
export const routeRequest = async (userMessage) => {
  try {
    // Always use LLM classification for accuracy
    const llmIntent = await classifyIntent(userMessage);
    console.log(`[Intent Router] LLM classified as: ${llmIntent}`);
    return llmIntent;
  } catch (error) {
    // Fallback to rule-based classification if LLM fails
    console.warn('[Intent Router] LLM classification failed, using rule-based fallback');
    const quickIntent = quickClassify(userMessage);
    console.log(`[Intent Router] Fallback classified as: ${quickIntent}`);
    return quickIntent;
  }
};
