/**
 * LLM CONFIGURATION FOR LANGCHAIN
 * 
 * PURPOSE:
 * - Centralized LLM configuration
 * - OpenAI client setup for LangChain
 * - Model parameters and safety limits
 * 
 * LANGCHAIN PATTERN:
 * - Uses @langchain/openai ChatOpenAI class
 * - Provides consistent configuration across all chains/agents
 * - Easy to swap LLM providers (Azure, Anthropic, etc.)
 */

import { ChatOpenAI } from "@langchain/openai";

/**
 * Production Safety Limits
 * Same as custom implementation for consistency
 */
export const LLM_CONFIG = {
  // Model selection
  MODEL: process.env.LLM_MODEL || 'gpt-4o-mini',
  
  // Temperature (0-2)
  // Lower = more deterministic, Higher = more creative
  // We use 0.7 to match ai/ implementation (allows natural tool usage)
  TEMPERATURE: parseFloat(process.env.LLM_TEMPERATURE) || 0.7,
  
  // Max tokens in response
  MAX_TOKENS: parseInt(process.env.LLM_MAX_TOKENS) || 500,
  
  // Request timeout (milliseconds)
  TIMEOUT: 60000, // 60 seconds
  
  // Max retries on transient failures
  MAX_RETRIES: 2,
  
  // Streaming (for real-time responses)
  STREAMING: false
};

/**
 * Create configured LangChain ChatOpenAI instance
 * 
 * LANGCHAIN BENEFIT:
 * - Same interface regardless of LLM provider
 * - Easy to swap OpenAI → Azure OpenAI → Anthropic
 * - Built-in retry logic
 * - Automatic rate limiting
 * - Token counting
 * 
 * @param {Object} overrides - Override default configuration
 * @returns {ChatOpenAI} Configured LangChain LLM instance
 */
export const createLLM = (overrides = {}) => {
  return new ChatOpenAI({
    modelName: overrides.model || LLM_CONFIG.MODEL,
    temperature: overrides.temperature !== undefined ? overrides.temperature : LLM_CONFIG.TEMPERATURE,
    maxTokens: overrides.maxTokens || LLM_CONFIG.MAX_TOKENS,
    timeout: overrides.timeout || LLM_CONFIG.TIMEOUT,
    maxRetries: overrides.maxRetries !== undefined ? overrides.maxRetries : LLM_CONFIG.MAX_RETRIES,
    streaming: overrides.streaming !== undefined ? overrides.streaming : LLM_CONFIG.STREAMING,
    // OpenAI-specific
    openAIApiKey: process.env.OPENAI_API_KEY,
    // Callbacks for tracing (LangSmith)
    callbacks: overrides.callbacks || [],
    // Tags for LangSmith filtering
    tags: overrides.tags || []
  });
};

/**
 * Create LLM for embeddings
 * Typically uses a different model optimized for embeddings
 */
export const EMBEDDING_CONFIG = {
  MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',
  TIMEOUT: 15000 // 15 seconds for embeddings
};

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * Custom (ai/src/llm/agent.js):
 * ```javascript
 * const openai = new OpenAI({
 *   apiKey: process.env.LLM_API_KEY,
 *   baseURL: process.env.LLM_BASE_URL
 * });
 * ```
 * 
 * LangChain (this file):
 * ```javascript
 * const llm = createLLM();
 * ```
 * 
 * ADVANTAGES OF LANGCHAIN:
 * ✅ Provider-agnostic interface
 * ✅ Built-in retry/timeout logic
 * ✅ Automatic tracing via LangSmith
 * ✅ Token counting
 * ✅ Callback system for monitoring
 * ✅ Easy to mock for testing
 * 
 * WHEN TO USE CUSTOM:
 * ❌ Need absolute minimal dependencies
 * ❌ Using provider-specific features not in LangChain
 * ❌ Want 100% control over HTTP requests
 */
