/**
 * INTENT ROUTER GRAPH - LangGraph State Machine
 * 
 * PURPOSE:
 * - Classify user intent using LLM
 * - Route to appropriate handler
 * - Extract entities for structured operations
 * - Handle clarification when needed
 * 
 * LANGGRAPH CONCEPTS:
 * ✅ StateGraph - Stateful workflow
 * ✅ Conditional edges - Dynamic routing
 * ✅ Node functions - State transformations
 * ✅ Graph compilation - Optimized execution
 * 
 * COMPARE WITH: ai/src/router/intentRouter.js (custom rule-based routing)
 */

import { StateGraph, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { IntentRouterStateSchema } from './state.js';
import { executeExpenseAgent } from '../agents/expense.agent.js';
import { handleRAGQuestion } from '../handlers/rag.handler.js';

/**
 * Node 1: Classify Intent
 * Uses LLM to determine user's intent
 */
const classifyIntent = async (state) => {
  console.log('[Intent Graph] ===== CLASSIFY INTENT START =====');
  console.log('[Intent Graph] State keys:', Object.keys(state));
  console.log('[Intent Graph] State.userMessage type:', typeof state.userMessage);
  console.log('[Intent Graph] State.userMessage value:', state.userMessage?.substring(0, 100));
  
  // Guard against undefined userMessage
  if (!state.userMessage) {
    console.warn('[Intent Graph] Missing userMessage in state');
    return { 
      intent: 'general_chat', 
      confidence: 0.3,
      reasoning: 'Could not process message',
      error: 'No message provided'
    };
  }
  
  try {
    console.log('[Intent Graph] Creating LLM...');
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0  // Deterministic for classification
    });
    
    console.log('[Intent Graph] Creating classification prompt...');
    
    // Build conversation context
    let conversationContext = '';
    if (state.conversationHistory && state.conversationHistory.length > 0) {
      conversationContext = '\n\nRecent conversation:\n';
      // Get last 3 exchanges for context
      const recentHistory = state.conversationHistory.slice(-6);
      recentHistory.forEach(msg => {
        conversationContext += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      });
      conversationContext += '\n';
    }
    
    const classificationPrompt = PromptTemplate.fromTemplate(`
You are an intent classifier for an expense tracking application.

Classify the user's message into ONE of these intents:
1. expense_operation - User wants to create, list, modify, or delete expenses
2. rag_question - User asks about their uploaded PDF documents/receipts
3. rag_compare - User wants to COMPARE PDF expenses with app expenses (but NOT sync)
4. reconciliation - User wants to SYNC or RECONCILE expenses between systems
5. general_chat - General conversation or greeting
6. clarification - Message is unclear or ambiguous

CRITICAL: If the recent conversation shows the assistant asked for CONFIRMATION (delete, clear expenses) 
and the user responds with confirmation words like "yes", "confirm", "ok", "proceed", "delete it", etc.,
classify as "expense_operation" with high confidence (0.95+).

CRITICAL: For rag_compare intent (COMPARE ONLY, NO SYNC):
- Keywords: "compare", "vs", "versus", "difference", "match", "check difference"
- Examples: "compare with app data", "what's different between PDF and my expenses", "check PDF vs app"
- Does NOT include sync/reconcile actions

CRITICAL: For reconciliation intent (SYNC/RECONCILE):
- Keywords: "sync", "synchronize", "reconcile", "merge", "update app", "add to app", "sync expenses", "reconcile data"
- Examples: "sync the data", "reconcile my expenses", "sync PDF with app", "update app from PDF"
- Implies ACTION to make systems consistent

{conversationContext}
Current user message: "{message}"

Also extract entities if present:
- action: add, list, show, modify, update, delete, remove, clear, compare, sync, reconcile
- amount: numeric value
- category: Food, Transport, Entertainment, etc.
- date: any date reference
- description: what the expense is for

Respond in JSON format:
{{
  "intent": "one of the 6 intents",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "entities": {{
    "action": "...",
    "amount": 123,
    "category": "...",
    "date": "...",
    "description": "..."
  }}
}}

IMPORTANT: Return ONLY the JSON object, no markdown code blocks or additional text.

Only include entities that are clearly present in the message.
`);
    
    console.log('[Intent Graph] Formatting prompt with message...');
    const prompt = await classificationPrompt.format({
      message: state.userMessage,
      conversationContext: conversationContext
    });
    console.log('[Intent Graph] Prompt created, calling LLM...');
    
    const response = await llm.invoke(prompt);
    
    console.log('[Intent Graph] LLM response received, parsing JSON...');
    console.log('[Intent Graph] Response content:', response.content?.substring(0, 200));
    
    // Safely parse JSON response
    let classification;
    try {
      // Clean response (remove markdown code blocks if present)
      // LLM sometimes wraps JSON in ```json ... ```
      let jsonText = response.content.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '');
      }
      
      classification = JSON.parse(jsonText);
      console.log('[Intent Graph] JSON parsed successfully');
    } catch (jsonError) {
      console.error('[Intent Graph] JSON parsing error:', jsonError.message);
      console.log('[Intent Graph] Raw response:', response.content);
      // If JSON parsing fails, treat as general chat
      return { intent: 'general_chat', confidence: 0.5, reasoning: 'Could not parse response' };
    }
    
    // Validate classification has required fields
    if (!classification.intent) {
      console.warn('[Intent Graph] Missing intent in classification');
      return { intent: 'general_chat', confidence: 0.5, reasoning: 'Invalid classification response' };
    }
    
    console.log('[Intent Graph] Classification:', classification.intent, 'confidence:', classification.confidence);
    console.log('[Intent Graph] ===== CLASSIFY INTENT END (SUCCESS) =====');
    
    return {
      intent: classification.intent,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      entities: classification.entities || {}
    };
    
  } catch (error) {
    console.error('[Intent Graph] ===== CLASSIFY INTENT EXCEPTION =====');
    console.error('[Intent Graph] Error name:', error.name);
    console.error('[Intent Graph] Error message:', error.message);
    console.error('[Intent Graph] Error stack:', error.stack);
    console.error('[Intent Graph] ===================================');
    
    // Fallback: simple keyword matching
    const userMsg = state.userMessage || '';
    const message = typeof userMsg === 'string' ? userMsg.toLowerCase() : '';
    
    console.log('[Intent Graph] Using keyword fallback. message:', message?.substring(0, 100));
    
    // Guard each includes call
    if (message && (message.includes('compare') || message.includes('vs') || message.includes('versus') || message.includes('difference') || message.includes('match'))) {
      console.log('[Intent Graph] Matched comparison keywords');
      return { intent: 'rag_compare', confidence: 0.7 };
    }
    
    if (message && (message.includes('pdf') || message.includes('document') || message.includes('receipt'))) {
      console.log('[Intent Graph] Matched RAG keywords');
      return { intent: 'rag_question', confidence: 0.6 };
    }
    
    if (message && (message.includes('reconcile') || message.includes('bank') || message.includes('statement') || message.includes('sync'))) {
      console.log('[Intent Graph] Matched reconciliation keywords');
      return { intent: 'reconciliation', confidence: 0.6 };
    }
    
    if (message && message.match && message.match(/^(add|create|list|show|modify|update|delete|remove|clear)/i)) {
      console.log('[Intent Graph] Matched expense operation keywords');
      return { intent: 'expense_operation', confidence: 0.7 };
    }
    
    console.log('[Intent Graph] Defaulting to general_chat');
    return { intent: 'general_chat', confidence: 0.5, reasoning: 'Unclear request, treating as general conversation' };
  }
};

/**
 * Node 2: Handle Expense Operations
 * Execute expense-related actions using agent
 */
const handleExpenseOperation = async (state) => {
  console.log('[Intent Graph] Handling expense operation');
  console.log('[Intent Graph] State keys in handleExpenseOperation:', Object.keys(state));
  
  // Guard against undefined userMessage
  if (!state.userMessage) {
    console.warn('[Intent Graph] Missing userMessage in handleExpenseOperation');
    return {
      error: 'Missing message',
      result: "I didn't receive your message properly. Could you please try again?"
    };
  }
  
  try {
    // Use the expense agent we built in Phase 1
    const result = await executeExpenseAgent(
      state.userMessage,
      state.authToken,
      state.conversationHistory,
      { userId: state.userId, traceId: state.traceId }
    );
    
    return {
      result,
      toolCalls: []  // Could track tool calls here
    };
    
  } catch (error) {
    console.error('[Intent Graph] Expense operation error:', error.message);
    console.error('[Intent Graph] Expense operation error stack:', error.stack);
    return {
      error: `Failed to process expense operation: ${error.message}`,
      result: "I encountered an error processing your expense request. Please try again."
    };
  }
};

/**
 * Node 3: Handle RAG Questions
 * Answer questions about PDFs
 */
const handleRAGQuery = async (state) => {
  console.log('[Intent Graph] Handling RAG question');
  console.log('[Intent Graph] State keys in handleRAGQuery:', Object.keys(state));
  
  // Guard against undefined userMessage
  if (!state.userMessage) {
    console.warn('[Intent Graph] Missing userMessage in handleRAGQuery');
    return {
      result: "I didn't receive your question properly. Could you please try again?"
    };
  }
  
  try {
    const ragResult = await handleRAGQuestion(
      state.userMessage,
      state.userId
    );
    
    // Format with sources
    let result = ragResult.answer;
    
    if (ragResult.sources && ragResult.sources.length > 0) {
      result += '\n\n📄 Sources:';
      ragResult.sources.forEach((source, idx) => {
        result += `\n${idx + 1}. ${source.filename}`;
        if (source.page) result += ` (page ${source.page})`;
      });
    }
    
    return { result };
    
  } catch (error) {
    console.error('[Intent Graph] RAG error:', error.message);
    console.error('[Intent Graph] RAG error stack:', error.stack);
    return {
      error: `Failed to answer question: ${error.message}`,
      result: "I encountered an error accessing your documents. Please try again."
    };
  }
};

/**
 * Node 4: Handle RAG Comparison
 * Compare PDF expenses with app expenses using LangChain
 * 
 * LANGCHAIN ARCHITECTURE:
 * - Uses LangChain LLM for expense extraction from PDF
 * - Deterministic comparison algorithm (NOT in LLM)
 * - Uses LangChain LLM for natural language explanation
 * 
 * COMPARE WITH: ai/src/handlers/ragCompareHandler.js
 * - Same workflow, different extraction method
 * - Custom: Regex patterns
 * - LangChain: LLM extraction
 */
const handleRAGComparison = async (state) => {
  console.log('[Intent Graph] Handling RAG comparison');
  console.log('[Intent Graph] State keys in handleRAGComparison:', Object.keys(state));
  
  // Guard against undefined userMessage
  if (!state.userMessage) {
    console.warn('[Intent Graph] Missing userMessage in handleRAGComparison');
    return {
      result: "I didn't receive your comparison request properly. Could you please try again?"
    };
  }
  
  try {
    // Import handler (dynamic to avoid circular dependencies)
    const { handleComparison } = await import('../handlers/comparison.handler.js');
    
    const result = await handleComparison(
      state.userMessage,
      state.userId,
      state.authToken
    );
    
    return { result };
    
  } catch (error) {
    console.error('[Intent Graph] Comparison error:', error.message);
    console.error('[Intent Graph] Comparison error stack:', error.stack);
    return {
      error: `Failed to compare expenses: ${error.message}`,
      result: "I encountered an error comparing your PDF and app expenses. Please ensure you have uploaded a PDF and try again."
    };
  }
};

/**
 * Node 5: Handle Reconciliation
 * Bi-directional sync between PDF expenses and app expenses
 * Uses deterministic planning + LangChain for explanation
 */
const handleReconciliation = async (state) => {
  console.log('[Intent Graph] Handling reconciliation');
  console.log('[Intent Graph] State keys in handleReconciliation:', Object.keys(state));
  
  try {
    // Dynamic import to avoid circular dependencies
    const { handleReconciliation: reconciliationHandler } = await import('../handlers/reconciliation.handler.js');
    
    console.log('[Intent Graph] Executing reconciliation workflow...');
    const result = await reconciliationHandler(
      state.userMessage,
      state.userId,
      state.authToken,
      { dryRun: false } // Full execution (not dry run)
    );
    
    return { result };
  } catch (error) {
    console.error('[Intent Graph] Reconciliation error:', error);
    return { 
      result: `❌ Reconciliation failed: ${error.message}\n\nPlease ensure you have uploaded a PDF and have expenses in your app.`
    };
  }
};

/**
 * Node 5: Handle General Chat
 * Simple conversation
 */
const handleGeneralChat = async (state) => {
  console.log('[Intent Graph] Handling general chat');
  console.log('[Intent Graph] State keys in handleGeneralChat:', Object.keys(state));
  
  // Guard against undefined userMessage
  if (!state.userMessage) {
    console.warn('[Intent Graph] Missing userMessage in handleGeneralChat');
    return {
      result: "I didn't receive your message properly. Could you please try again?"
    };
  }
  
  try {
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.7
    });
    
    const systemPrompt = `You are a helpful expense tracking assistant. 
Keep responses brief and friendly. If asked about capabilities, mention:
- Adding, viewing, modifying, and deleting expenses
- Answering questions about uploaded PDF receipts
- Comparing PDF expenses with app expenses to find differences
- Reconciling bank statements (coming soon)`;
    
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(state.userMessage)
    ]);
    
    return { result: response.content };
    
  } catch (error) {
    console.error('[Intent Graph] General chat error:', error.message);
    console.error('[Intent Graph] General chat error stack:', error.stack);
    return {
      result: "Hello! I'm your expense tracking assistant. I can help you manage expenses, answer questions about your receipts, and more. What would you like to do?"
    };
  }
};

/**
 * Node 6: Request Clarification
 * Ask user for more information
 */
const requestClarification = async (state) => {
  console.log('[Intent Graph] Requesting clarification');
  console.log('[Intent Graph] State keys in requestClarification:', Object.keys(state));
  
  const clarificationQuestion = "I'm not sure I understood that. Could you please clarify? For example:\n" +
    "- 'Add 500 for lunch today'\n" +
    "- 'Show my expenses'\n" +
    "- 'What does my receipt say about dinner?'";
  
  return {
    needsClarification: true,
    clarificationQuestion,
    result: clarificationQuestion
  };
};

/**
 * Routing Function: Decide which handler to call
 * This is the "conditional edge" in LangGraph
 */
const routeByIntent = (state) => {
  console.log('[Intent Graph] Routing based on intent:', state.intent);
  
  // Low confidence -> clarification
  if (state.confidence < 0.5) {
    return 'clarification';
  }
  
  // Route by intent
  switch (state.intent) {
    case 'expense_operation':
      return 'expense_operation';
    case 'rag_question':
      return 'rag_question';
    case 'rag_compare':
      return 'rag_compare';
    case 'reconciliation':
      return 'reconciliation';
    case 'general_chat':
      return 'general_chat';
    case 'clarification':
      return 'clarification';
    default:
      return 'general_chat';
  }
};

/**
 * Define channels for StateGraph
 * This tells the graph which fields to preserve through the workflow
 */
const defineChannels = () => {
  return {
    userMessage: {
      value: (x, y) => y !== undefined ? y : x,
      default: () => ''
    },
    userId: {
      value: (x, y) => y !== undefined ? y : x,
      default: () => null
    },
    authToken: {
      value: (x, y) => y !== undefined ? y : x,
      default: () => null
    },
    conversationHistory: {
      value: (x, y) => y !== undefined ? y : x,
      default: () => []
    },
    traceId: {
      value: (x, y) => y !== undefined ? y : x,
      default: () => ''
    },
    timestamp: {
      value: (x, y) => y !== undefined ? y : x,
      default: () => ''
    },
    intent: {
      value: (x, y) => y !== undefined ? y : x,
      default: () => null
    },
    confidence: {
      value: (x, y) => y !== undefined ? y : x,
      default: () => 0
    },
    reasoning: {
      value: (x, y) => y !== undefined ? y : x,
      default: () => ''
    },
    entities: {
      value: (x, y) => y !== undefined ? y : x,
      default: () => ({})
    },
    result: {
      value: (x, y) => y !== undefined ? y : x,
      default: () => ''
    },
    error: {
      value: (x, y) => y !== undefined ? y : x,
      default: () => null
    }
  };
};

/**
 * Build the Intent Router Graph
 * 
 * GRAPH STRUCTURE:
 * 
 *     START
 *       ↓
 *   classify_intent
 *       ↓
 *   [conditional routing]
 *       ↓
 *   ├─→ expense_operation → END
 *   ├─→ rag_question → END
 *   ├─→ rag_compare → END
 *   ├─→ reconciliation → END
 *   ├─→ general_chat → END
 *   └─→ clarification → END
 */
const buildIntentRouterGraph = () => {
  try {
    // Create state graph with proper channel definitions
    console.log('[Intent Graph] Creating StateGraph...');
    const workflow = new StateGraph({
      channels: defineChannels()
    });
    
    // Add nodes
    console.log('[Intent Graph] Adding nodes to workflow...');
    workflow.addNode("classify_intent", classifyIntent);
    workflow.addNode("expense_operation", handleExpenseOperation);
    workflow.addNode("rag_question", handleRAGQuery);
    workflow.addNode("rag_compare", handleRAGComparison);
    workflow.addNode("reconciliation", handleReconciliation);
    workflow.addNode("general_chat", handleGeneralChat);
    workflow.addNode("clarification", requestClarification);
    
    // Set entry point
    console.log('[Intent Graph] Setting entry point...');
    workflow.setEntryPoint("classify_intent");
    
    // Add conditional routing from classification
    console.log('[Intent Graph] Adding conditional edges...');
    workflow.addConditionalEdges(
      "classify_intent",
      routeByIntent,
      {
        expense_operation: "expense_operation",
        rag_question: "rag_question",
        rag_compare: "rag_compare",
        reconciliation: "reconciliation",
        general_chat: "general_chat",
        clarification: "clarification"
      }
    );
    
    // All handlers end the graph
    console.log('[Intent Graph] Adding final edges...');
    workflow.addEdge("expense_operation", END);
    workflow.addEdge("rag_question", END);
    workflow.addEdge("rag_compare", END);
    workflow.addEdge("reconciliation", END);
    workflow.addEdge("general_chat", END);
    workflow.addEdge("clarification", END);
    
    // Compile graph
    console.log('[Intent Graph] Compiling workflow...');
    const compiled = workflow.compile();
    console.log('[Intent Graph] Workflow compiled successfully');
    return compiled;
  } catch (error) {
    console.error('[Intent Graph] Error building graph:', error.message);
    console.error('[Intent Graph] Error stack:', error.stack);
    throw error;
  }
};

// Singleton graph instance
let intentRouterGraph = null;

/**
 * Get or create intent router graph
 */
export const getIntentRouterGraph = () => {
  if (!intentRouterGraph) {
    console.log('[Intent Graph] Building graph...');
    intentRouterGraph = buildIntentRouterGraph();
    console.log('[Intent Graph] Graph ready');
  }
  return intentRouterGraph;
};

/**
 * Execute intent routing
 * Main entry point for chat messages
 */
export const executeIntentRouter = async (userMessage, userId, authToken, conversationHistory = []) => {
  try {
    console.log('[Intent Router] Processing message for user', userId);
    
    const graph = getIntentRouterGraph();
    
    // Initial state
    const initialState = {
      userMessage,
      userId,
      authToken,
      conversationHistory,
      traceId: `intent-${Date.now()}`,
      timestamp: new Date().toISOString()
    };
    
    // Execute graph
    const result = await graph.invoke(initialState);
    
    console.log('[Intent Router] Complete:', {
      intent: result.intent,
      confidence: result.confidence,
      hasResult: !!result.result
    });
    
    return result;
    
  } catch (error) {
    console.error('[Intent Router] Error:', error.message);
    throw error;
  }
};

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * Custom (ai/src/router/intentRouter.js):
 * ```javascript
 * // Hardcoded rules
 * export const routeIntent = async (message) => {
 *   // Rule-based classification
 *   if (message.match(/add|create/)) return 'transactional';
 *   if (message.match(/pdf|document/)) return 'rag';
 *   
 *   // Call appropriate handler
 *   if (intent === 'transactional') {
 *     return await handleTransactional(message);
 *   }
 *   
 *   // ~200 LOC of if-else chains
 * };
 * ```
 * 
 * LangGraph (this file):
 * ```javascript
 * // LLM-based classification
 * const graph = buildIntentRouterGraph();
 * 
 * // Graph handles routing automatically
 * const result = await graph.invoke({ userMessage, userId });
 * 
 * // ~150 LOC, more flexible
 * ```
 * 
 * ADVANTAGES OF LANGGRAPH:
 * ✅ LLM-based classification (more accurate)
 * ✅ Visual graph structure (easier to understand)
 * ✅ Conditional routing (no if-else chains)
 * ✅ State management (automatic)
 * ✅ Easy to add new intents (just add node + edge)
 * ✅ Built-in error handling
 * ✅ Automatic LangSmith tracing
 * ✅ Can checkpoint and resume
 * 
 * GRAPH VISUALIZATION:
 * 
 * When LANGCHAIN_TRACING_V2=true, you can see the graph execution in LangSmith:
 * - Which nodes were visited
 * - State at each node
 * - Routing decisions
 * - Execution time per node
 * 
 * ADDING NEW INTENT:
 * 
 * 1. Add to state schema:
 *    intent: z.enum([..., 'new_intent'])
 * 
 * 2. Create handler node:
 *    const handleNewIntent = async (state) => {...}
 * 
 * 3. Add node to graph:
 *    workflow.addNode("new_intent", handleNewIntent)
 * 
 * 4. Add to routing:
 *    case 'new_intent': return 'new_intent'
 * 
 * 5. Add edge:
 *    workflow.addEdge("new_intent", END)
 * 
 * That's it! No refactoring needed.
 */
