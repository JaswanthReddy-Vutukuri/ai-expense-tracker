/**
 * LANGSMITH CONFIGURATION & TRACING SETUP
 * 
 * PURPOSE:
 * - Configure LangSmith observability platform
 * - Enable automatic tracing of all LangChain operations
 * - Provide utilities for custom tagging and metadata
 * 
 * LANGSMITH BENEFITS:
 * ✅ Automatic tracing (no manual logging)
 * ✅ Visual workflow debugging
 * ✅ Cost tracking per request
 * ✅ Performance analytics
 * ✅ Error analysis
 * ✅ Prompt versioning
 * 
 * COMPARE WITH: Custom logging in ai/src/utils/logger.js
 */

import { Client } from "langsmith";

/**
 * LangSmith Client Configuration
 * 
 * ENVIRONMENT VARIABLES:
 * - LANGCHAIN_TRACING_V2: Enable/disable tracing ("true"/"false")
 * - LANGCHAIN_API_KEY: LangSmith API key
 * - LANGCHAIN_PROJECT: Project name for trace organization
 * - LANGCHAIN_ENDPOINT: LangSmith API endpoint (default: https://api.smith.langchain.com)
 */
export const LANGSMITH_CONFIG = {
  ENABLED: process.env.LANGCHAIN_TRACING_V2 === 'true',
  API_KEY: process.env.LANGCHAIN_API_KEY,
  PROJECT: process.env.LANGCHAIN_PROJECT || 'expense-tracker-ai-langx',
  ENDPOINT: process.env.LANGCHAIN_ENDPOINT || 'https://api.smith.langchain.com'
};

/**
 * Create LangSmith client for manual tracing
 * 
 * AUTO-TRACING:
 * LangChain automatically traces chains/agents/tools when LANGCHAIN_TRACING_V2=true
 * 
 * MANUAL TRACING:
 * Use this client for custom spans (e.g., non-LangChain operations)
 */
export const createLangSmithClient = () => {
  if (!LANGSMITH_CONFIG.ENABLED) {
    console.log('[LangSmith] Tracing disabled');
    return null;
  }
  
  if (!LANGSMITH_CONFIG.API_KEY) {
    console.warn('[LangSmith] Tracing enabled but LANGCHAIN_API_KEY not set');
    return null;
  }
  
  return new Client({
    apiKey: LANGSMITH_CONFIG.API_KEY,
    apiUrl: LANGSMITH_CONFIG.ENDPOINT
  });
};

/**
 * Generate trace metadata for LangChain operations
 * 
 * USAGE:
 * ```javascript
 * const llm = createLLM({
 *   tags: getTraceTags('chat', userId),
 *   metadata: getTraceMetadata(traceId, userId)
 * });
 * ```
 * 
 * This adds context to traces in LangSmith UI
 */
export const getTraceTags = (intent, userId) => {
  const tags = ['expense-tracker', intent];
  if (userId) {
    tags.push(`user:${userId}`);
  }
  return tags;
};

export const getTraceMetadata = (traceId, userId, additionalMeta = {}) => {
  return {
    traceId,
    userId,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    ...additionalMeta
  };
};

/**
 * Initialize LangSmith tracing
 * Call this early in application startup
 */
export const initializeLangSmith = () => {
  if (!LANGSMITH_CONFIG.ENABLED) {
    console.log('[LangSmith] ❌ Tracing disabled (set LANGCHAIN_TRACING_V2=true to enable)');
    return;
  }
  
  if (!LANGSMITH_CONFIG.API_KEY) {
    console.warn('[LangSmith] ⚠️  Tracing enabled but LANGCHAIN_API_KEY not set');
    return;
  }
  
  console.log('[LangSmith] ✅ Tracing enabled');
  console.log(`[LangSmith] 📊 Project: ${LANGSMITH_CONFIG.PROJECT}`);
  console.log(`[LangSmith] 🔗 Dashboard: https://smith.langchain.com/`);
};

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * ┌────────────────────────┬──────────────────────────┬─────────────────────────┐
 * │ Feature                │ Custom Logging (ai/)     │ LangSmith (ai-langx/)   │
 * ├────────────────────────┼──────────────────────────┼─────────────────────────┤
 * │ Setup Complexity       │ Medium (Winston/custom)  │ Low (env vars)          │
 * │ Trace Visualization    │ ❌ Logs only             │ ✅ Interactive graph    │
 * │ Tool Call Tracking     │ Manual console.log       │ ✅ Automatic            │
 * │ Token Counting         │ ❌ None                  │ ✅ Automatic            │
 * │ Cost Analysis          │ Manual calculation       │ ✅ Built-in dashboard   │
 * │ Error Debugging        │ Stack traces in logs     │ ✅ Visual error path    │
 * │ Prompt Management      │ Code comments            │ ✅ Versioned prompts    │
 * │ Performance Analysis   │ Manual timing logs       │ ✅ Latency charts       │
 * │ Search/Filter          │ grep logs                │ ✅ UI filters           │
 * │ Sharing/Collaboration  │ Share log files          │ ✅ Share trace links    │
 * │ Production Ready       │ ✅ Yes                   │ ✅ Yes                  │
 * └────────────────────────┴──────────────────────────┴─────────────────────────┘
 * 
 * WHEN TO USE LANGSMITH:
 * ✅ Debugging complex agent behavior
 * ✅ Analyzing cost per request/user
 * ✅ Understanding multi-step workflows
 * ✅ Comparing prompt versions
 * ✅ Team collaboration on AI features
 * 
 * WHEN TO USE CUSTOM LOGGING:
 * ✅ No external dependencies allowed
 * ✅ Need custom log formats (compliance)
 * ✅ Already have logging infrastructure
 * ✅ Sensitive data cannot leave network
 */

/**
 * LANGSMITH TRACE EXAMPLE:
 * 
 * When user sends: "Add 500 for lunch today"
 * 
 * LangSmith shows:
 * 
 * 📊 Trace: expense_chat_request_xyz
 * ├─ 🤖 LLM Call: intent_classification (120ms, 250 tokens)
 * │  └─ Input: "Add 500 for lunch today"
 * │  └─ Output: "TRANSACTIONAL"
 * ├─ 🔧 Tool: create_expense (500ms)
 * │  └─ Input: {amount: 500, category: "Food", date: "2026-02-08"}
 * │  └─ Output: "✅ Successfully added..."
 * └─ 🤖 LLM Call: final_response (80ms, 150 tokens)
 *    └─ Output: "I've added ₹500 for lunch today."
 * 
 * Total: 700ms, 400 tokens, $0.0008
 * 
 * You can click any step to see full input/output, edit prompts, and re-run.
 */
