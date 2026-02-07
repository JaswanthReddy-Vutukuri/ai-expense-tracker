import OpenAI from 'openai';
import { getSystemPrompt } from './systemPrompt.js';
import { getToolDefinitions, executeTool } from '../mcp/tools/index.js';
import { createLogger, generateTraceId } from '../utils/logger.js';
import { classifyError, getUserMessage } from '../utils/errorClassification.js';
import { recordUsage } from '../utils/costTracking.js';

// Structured logging instead of console.log
const logger = createLogger('llm-agent');

// Configure OpenAI client with environment-based settings
// If LLM_BASE_URL is not set, uses default OpenAI endpoint
const openaiConfig = {
  apiKey: process.env.LLM_API_KEY
};

// Add custom baseURL only if configured
if (process.env.LLM_BASE_URL) {
  openaiConfig.baseURL = process.env.LLM_BASE_URL;
  logger.info('Using custom LLM endpoint', { endpoint: process.env.LLM_BASE_URL });
}

const openai = new OpenAI(openaiConfig);

// Get model from environment or use default
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

/**
 * PRODUCTION SAFETY LIMITS
 * 
 * Why These Matter in MCP Systems:
 * --------------------------------
 * - MAX_TOOL_ITERATIONS: Prevents infinite tool-calling loops
 *   Without this: LLM could call tools forever, burning money and hanging requests
 * 
 * - LLM_TIMEOUT: Ensures OpenAI API calls don't hang indefinitely
 *   Without this: Network issues could leave requests waiting forever
 * 
 * - MAX_RESPONSE_TOKENS: Controls LLM output length
 *   Without this: Verbose responses waste tokens and time
 * 
 * These are CRITICAL for production - DO NOT REMOVE
 */
const MAX_TOOL_ITERATIONS = 5;  // Maximum tool call cycles per request
const LLM_TIMEOUT = 60000;      // 60 seconds for LLM API calls
const MAX_RESPONSE_TOKENS = 500; // Limit response verbosity

/**
 * Parse tool calls from text when LLM doesn't support function calling API
 * 
 * Supports multiple formats (priority order):
 * 1. Structured JSON: {"tool_calls": [{"name": "tool", "arguments": {...}}], "message": "..."}
 * 2. Python-style: <|python_start|>tool_name(arg="value")<|python_end|>
 * 3. Bracket-style: [tool_name(arg=value)]
 * 
 * @param {string} text - LLM response text
 * @returns {Object|null} {toolCalls: Array, message: string} or null
 */
const parseToolCallsFromText = (text) => {
  // Strategy 1: Try parsing as structured JSON (most reliable)
  try {
    const jsonMatch = text.match(/\{[\s\S]*"tool_calls"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
        const toolCalls = parsed.tool_calls.map((tc, idx) => ({
          id: `parsed-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {})
          }
        }));
        return {
          toolCalls,
          message: parsed.message || null
        };
      }
    }
  } catch (e) {
    // Not valid JSON, try other formats
  }
  
  // Strategy 2: Parse Python-style or bracket-style syntax (legacy fallback)
  const toolCalls = [];
  
  // Pattern 1: Python-style <|python_start|>tool_name(...)<|python_end|>
  const pythonPattern = /<\|python_start\|>([\w_]+)\(([^)]*)\)<\|python_end\|>/g;
  let match;
  
  while ((match = pythonPattern.exec(text)) !== null) {
    const functionName = match[1];
    const argsString = match[2];
    const args = parseArgumentString(argsString);
    
    toolCalls.push({
      id: `parsed-${Date.now()}-${toolCalls.length}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'function',
      function: {
        name: functionName,
        arguments: JSON.stringify(args)
      }
    });
  }
  
  // Pattern 2: Bracket-style [tool_name(...)]
  if (toolCalls.length === 0) {
    const bracketPattern = /\[([\w_]+)\(([^)]*)\)\]/g;
    
    while ((match = bracketPattern.exec(text)) !== null) {
      const functionName = match[1];
      const argsString = match[2];
      const args = parseArgumentString(argsString);
      
      toolCalls.push({
        id: `parsed-${Date.now()}-${toolCalls.length}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        function: {
          name: functionName,
          arguments: JSON.stringify(args)
        }
      });
    }
  }
  
  if (toolCalls.length > 0) {
    return {
      toolCalls,
      message: text.replace(/<\|python_start\|>.*?<\|python_end\|>/g, '')
                   .replace(/\[[\w_]+\([^)]*\)\]/g, '')
                   .trim() || null
    };
  }
  
  return null;
};

/**
 * Parse argument string into object
 * Handles: key="value", key='value', key=value
 */
const parseArgumentString = (argsString) => {
  const args = {};
  
  if (!argsString || argsString.trim() === '') {
    return args;
  }
  
  // Match key=value pairs with optional quotes
  const argPairs = argsString.match(/([\w_]+)\s*=\s*(["'].*?["']|[^,]+)/g) || [];
  
  for (const pair of argPairs) {
    const eqIndex = pair.indexOf('=');
    const key = pair.substring(0, eqIndex).trim();
    let value = pair.substring(eqIndex + 1).trim();
    
    // Remove quotes
    value = value.replace(/^["']|["']$/g, '');
    
    // Parse numbers
    if (/^\d+(\.\d+)?$/.test(value)) {
      args[key] = parseFloat(value);
    } else {
      args[key] = value;
    }
  }
  
  return args;
};

/**
 * Detect if model supports native function calling
 * @param {string} modelName - LLM model name
 * @returns {boolean}
 */
const supportsNativeFunctionCalling = (modelName) => {
  if (!modelName) return false;
  
  const functionCallingModels = [
    'gpt-4', 'gpt-3.5-turbo', 'gpt-4o', 'gpt-4-turbo',
    'claude-3', 'claude-2',
    'gemini-pro', 'gemini-1.5'
  ];
  
  return functionCallingModels.some(model => modelName.toLowerCase().includes(model));
};

/**
 * Main logic loop for processing user requests through the LLM.
 * 
 * Production Hardening Applied:
 * ----------------------------
 * - Structured logging with trace IDs
 * - Tool iteration limits (prevents infinite loops)
 * - Timeout protection on LLM calls
 * - Error classification and user-friendly messages
 * - Token usage tracking
 * - Comprehensive observability
 * 
 * MCP Safety Guarantees:
 * ----------------------
 * - Tools execute through validated wrappers only
 * - Each tool call has timeout and retry logic
 * - Errors are classified and handled appropriately
 * - All operations are logged for auditing
 * 
 * @param {string} userMessage - Current user message
 * @param {string} authToken - JWT token for backend authentication
 * @param {Array} history - Optional conversation history [{ role: 'user'|'assistant', content: '...' }]
 * @param {Object} context - Additional context (userId, traceId)
 * @returns {Promise<string>} Natural language response
 */
export const processChatMessage = async (userMessage, authToken, history = [], context = {}) => {
  // Generate trace ID for request correlation across logs
  const traceId = context.traceId || generateTraceId();
  const userId = context.userId || 'unknown';
  
  // Create child logger with trace context
  const requestLogger = logger.child({ traceId, userId });
  
  const startTime = Date.now();
  
  requestLogger.info('Processing chat message', {
    messageLength: userMessage.length,
    historyLength: history.length
  });

  // Detect if model supports function calling and adjust prompt accordingly
  const modelSupportsTools = supportsNativeFunctionCalling(LLM_MODEL);
  
  if (!modelSupportsTools) {
    requestLogger.info('Model does not support native function calling, using structured JSON output', {
      model: LLM_MODEL
    });
  }

  const messages = [
    { role: "system", content: getSystemPrompt(modelSupportsTools) }
  ];
  
  // Add conversation history if provided (for context continuity)
  if (history && history.length > 0) {
    requestLogger.debug('Including conversation history', { messageCount: history.length });
    messages.push(...history);
  }
  
  // Extract pending_action from the last assistant message if present
  // This handles cases where user responds with just "yes" or "no"
  let extractedPendingAction = null;
  if (history && history.length > 0) {
    // Find the last assistant message in history
    const lastAssistantMessage = [...history].reverse().find(msg => msg.role === 'assistant');
    
    if (lastAssistantMessage && lastAssistantMessage.content) {
      const pendingActionMatch = lastAssistantMessage.content.match(/<!--PENDING_ACTION:([\s\S]+?)-->/);
      if (pendingActionMatch) {
        try {
          extractedPendingAction = JSON.parse(pendingActionMatch[1]);
          requestLogger.info('Extracted pending action from conversation history', {
            pendingTool: extractedPendingAction.tool
          });
        } catch (e) {
          requestLogger.warn('Failed to parse pending action from history', { error: e.message });
        }
      }
    }
  }
  
  // Add current user message with optional pending action context
  let enhancedUserMessage = userMessage;
  if (extractedPendingAction) {
    // User is likely responding to a confirmation request
    // Check if message is a simple confirmation
    const simpleConfirmation = /^(yes|no|ok|okay|confirm|cancel|proceed|abort|delete)$/i.test(userMessage.trim());
    
    if (simpleConfirmation) {
      const isConfirming = /^(yes|ok|okay|confirm|proceed|delete)$/i.test(userMessage.trim());
      
      if (isConfirming) {
        // Inject the pending action so LLM knows what to call
        enhancedUserMessage = `${userMessage}\n\n[CONTEXT: User is confirming the pending operation. Call ${extractedPendingAction.tool} with arguments: ${JSON.stringify(extractedPendingAction.arguments)}]`;
        requestLogger.info('Enhanced simple confirmation with pending action context', {
          originalMessage: userMessage,
          pendingTool: extractedPendingAction.tool
        });
      } else {
        // User is canceling
        enhancedUserMessage = `${userMessage}\n\n[CONTEXT: User is declining the pending ${extractedPendingAction.tool} operation. Do NOT call any tools, just acknowledge the cancellation.]`;
        requestLogger.info('User declined pending operation', {
          originalMessage: userMessage,
          declinedTool: extractedPendingAction.tool
        });
      }
    }
  }
  
  messages.push({ role: "user", content: enhancedUserMessage });

  // Tool iteration tracking
  let toolIterationCount = 0;
  let totalTokensUsed = 0;
  let pendingAction = null; // Track any pending confirmation actions

  try {
    // First call to determine if tools are needed
    requestLogger.debug('Calling LLM for initial response', { model: LLM_MODEL });
    
    const response = await callLLMWithTimeout(messages, requestLogger, traceId, userId);
    
    // Track token usage for cost monitoring
    totalTokensUsed += response.usage?.total_tokens || 0;
    
    let responseMessage = response.choices[0].message;
    
    requestLogger.debug('LLM response received', {
      hasToolCalls: !!responseMessage.tool_calls,
      toolCallsCount: responseMessage.tool_calls?.length || 0,
      tokensUsed: response.usage?.total_tokens || 0,
      hasContent: !!responseMessage.content,
      contentSample: responseMessage.content?.substring(0, 200),
      toolCallsSample: responseMessage.tool_calls?.map(tc => ({ 
        name: tc.function.name, 
        argsPreview: tc.function.arguments?.substring(0, 100) 
      }))
    });

    // FALLBACK: Parse text-based tool calls if model doesn't support function calling API
    if ((!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) && responseMessage.content) {
      const parseResult = parseToolCallsFromText(responseMessage.content);
      
      if (parseResult && parseResult.toolCalls && parseResult.toolCalls.length > 0) {
        requestLogger.info('Detected text-based tool calls, converting to function calls', {
          toolCount: parseResult.toolCalls.length,
          tools: parseResult.toolCalls.map(tc => tc.function.name),
          format: responseMessage.content.includes('"tool_calls"') ? 'structured-json' : 'legacy-syntax',
          originalContent: responseMessage.content.substring(0, 150)
        });
        
        // Convert parsed tool calls to proper format
        responseMessage.tool_calls = parseResult.toolCalls;
        
        // Use parsed message or clean content
        responseMessage.content = parseResult.message || null;
      }
    }

    // DETECTION: Warn if LLM claims to do action without calling tools
    if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
      const content = (responseMessage.content || '').toLowerCase();
      const actionWords = ['added', 'created', 'deleted', 'modified', 'updated', 'cleared', 'removed'];
      const hasActionClaim = actionWords.some(word => content.includes(word));
      const userIntent = userMessage.toLowerCase();
      const needsAction = ['add', 'create', 'delete', 'remove', 'clear', 'modify', 'update'].some(word => userIntent.includes(word));
      
      // Also detect if LLM is writing tool names in brackets [tool_name]
      const hasBracketedTool = /\[(list_expenses|create_expense|modify_expense|delete_expense|clear_expenses)\]/.test(content);
      
      if (hasActionClaim || needsAction || hasBracketedTool) {
        requestLogger.warn('LLM may be hallucinating - claimed action without tool call', {
          userMessage: userMessage.substring(0, 100),
          responsePreview: responseMessage.content?.substring(0, 100),
          hasActionClaim,
          needsAction,
          hasBracketedTool
        });
        
        // If LLM wrote tool name in brackets, return error message
        if (hasBracketedTool) {
          return "I apologize, but I encountered an issue with tool execution. Please try rephrasing your request, or contact support if this persists.";
        }
      }
    }

    // PRODUCTION SAFETY: Tool execution loop with iteration limit
    while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      toolIterationCount++;
      
      // CRITICAL: Prevent infinite tool-calling loops
      if (toolIterationCount > MAX_TOOL_ITERATIONS) {
        requestLogger.error('Tool iteration limit exceeded', {
          limit: MAX_TOOL_ITERATIONS,
          iterations: toolIterationCount
        });
        
        return "I apologize, but I'm having trouble completing your request. It requires too many operations. Please try breaking it into smaller requests.";
      }

      // Add assistant's tool request
      // IMPORTANT: OpenAI requires content to be a string, not null
      messages.push({
        ...responseMessage,
        content: responseMessage.content || "" // Normalize null to empty string
      });
      
      requestLogger.info('Processing tool calls', {
        iteration: toolIterationCount,
        toolCount: responseMessage.tool_calls.length
      });
      
      // Process all tool calls for this iteration
      for (const toolCall of responseMessage.tool_calls) {
        const functionName = toolCall.function.name;
        let functionArgs;
        
        try {
          functionArgs = JSON.parse(toolCall.function.arguments);
        } catch (parseError) {
          requestLogger.error('Failed to parse tool arguments', {
            toolName: functionName,
            rawArgs: toolCall.function.arguments,
            error: parseError.message
          });
          
          // Return error to LLM
          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: JSON.stringify({ 
              error: 'Invalid arguments format',
              details: parseError.message 
            })
          });
          continue;
        }

        requestLogger.info('Executing tool', {
          toolName: functionName,
          args: functionArgs,
          hasToken: !!authToken,
          toolCallId: toolCall.id
        });

        try {
          // Execute the tool implementation (calling backend via Axios)
          // Tool execution now includes timeout, retry, and validation
          requestLogger.debug('About to call executeTool', { 
            functionName, 
            functionArgs,
            hasContext: !!context 
          });
          const toolResult = await executeTool(
            functionName, 
            functionArgs, 
            authToken,
            { traceId, userId } // Pass context for logging
          );

          // Check if tool returned a pending_action (for confirmation workflows)
          if (toolResult && toolResult.pending_action) {
            pendingAction = toolResult.pending_action;
            requestLogger.info('Tool returned pending action requiring user confirmation', {
              toolName: functionName,
              pendingTool: pendingAction.tool
            });
          }

          requestLogger.info('Tool execution successful', {
            toolName: functionName,
            hasPendingAction: !!toolResult?.pending_action
          });

          // Add tool result to conversation
          // IMPORTANT: Ensure content is always a valid string, never null/undefined
          const toolContent = toolResult !== undefined && toolResult !== null 
            ? JSON.stringify(toolResult) 
            : JSON.stringify({ success: true });
          
          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: toolContent,
          });
        } catch (error) {
          // Error classification for appropriate handling
          const errorClassification = classifyError(error);
          
          requestLogger.error('Tool execution failed', {
            toolName: functionName,
            category: errorClassification.category,
            message: errorClassification.message,
            retryable: errorClassification.retryable
          });
          
          // Return structured error to LLM for appropriate user messaging
          const errorMessage = errorClassification.userFacing 
            ? errorClassification.message 
            : 'Operation failed due to a system error';
            
          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: JSON.stringify({ 
              error: errorMessage,
              category: errorClassification.category
            }),
          });
        }
      }

      requestLogger.debug('Getting next LLM response', { 
        iteration: toolIterationCount,
        messageCount: messages.length
      });

      // Get next response from LLM (might trigger more tools or provide final answer)
      try {
        const nextResponse = await callLLMWithTimeout(messages, requestLogger, traceId, userId);
        totalTokensUsed += nextResponse.usage?.total_tokens || 0;
        responseMessage = nextResponse.choices[0].message;
        
        // FALLBACK: Parse text-based tool calls again (for custom LLMs)
        if ((!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) && responseMessage.content) {
          const parseResult = parseToolCallsFromText(responseMessage.content);
          
          if (parseResult && parseResult.toolCalls && parseResult.toolCalls.length > 0) {
            requestLogger.info('Detected text-based tool calls in follow-up response', {
              toolCount: parseResult.toolCalls.length,
              tools: parseResult.toolCalls.map(tc => tc.function.name)
            });
            
            responseMessage.tool_calls = parseResult.toolCalls;
            responseMessage.content = parseResult.message || null;
          }
        }
        
      } catch (error) {
        const errorClassification = classifyError(error);
        requestLogger.error('LLM call failed in tool loop', {
          iteration: toolIterationCount,
          category: errorClassification.category
        });
        
        return "I encountered an issue while processing your request. Please try again in a moment.";
      }
    }

    // DETECTION: Check if LLM called list_expenses but didn't follow through with modify/delete
    const toolCallsInHistory = messages
      .filter(m => m.role === 'tool')
      .map(m => m.name);
    
    const calledListExpenses = toolCallsInHistory.includes('list_expenses');
    const calledModifyOrDelete = toolCallsInHistory.some(name => 
      ['modify_expense', 'delete_expense', 'clear_expenses'].includes(name)
    );
    
    const userIntent = userMessage.toLowerCase();
    const wantsModification = ['update', 'modify', 'change', 'edit', 'set'].some(word => userIntent.includes(word));
    const wantsDeletion = ['delete', 'remove', 'clear'].some(word => userIntent.includes(word));
    
    if (calledListExpenses && !calledModifyOrDelete && (wantsModification || wantsDeletion)) {
      requestLogger.warn('LLM stopped after list_expenses without completing operation', {
        userIntent: userMessage.substring(0, 100),
        wantsModification,
        wantsDeletion,
        toolCallsInHistory
      });
      
      return "I found the expenses but encountered an issue completing the update. Please try rephrasing your request, for example: 'update expense 44 to 800' with the specific expense ID.";
    }

    // No more tool calls - return final response
    const duration = Date.now() - startTime;
    
    requestLogger.info('Chat processing complete', {
      duration,
      toolIterations: toolIterationCount,
      totalTokens: totalTokensUsed,
      hasPendingAction: !!pendingAction
    });

    let finalResponse = responseMessage.content || "I've processed your request successfully.";
    
    // If there's a pending action, embed it in the response for the next turn
    // Format: <!--PENDING_ACTION:{json}-->
    if (pendingAction) {
      const pendingActionJson = JSON.stringify(pendingAction);
      finalResponse += `\n\n<!--PENDING_ACTION:${pendingActionJson}-->`;
      requestLogger.debug('Embedded pending action in response', { pendingAction });
    }
    
    return finalResponse;

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorClassification = classifyError(error);
    
    requestLogger.error('Chat processing failed', {
      duration,
      category: errorClassification.category,
      message: errorClassification.message
    });
    
    // Return user-friendly message
    return getUserMessage(errorClassification);
  }

};

/**
 * Calls OpenAI API with timeout protection and cost tracking
 * 
 * Production Safety:
 * -----------------
 * - Prevents hanging on network issues
 * - Enforces response time SLAs
 * - Enables downstream timeout handling
 * - Tracks token usage for cost monitoring
 * 
 * @param {Array} messages - Conversation messages
 * @param {Object} logger - Logger instance
 * @param {string} traceId - Trace ID for correlation
 * @param {number} userId - User ID for cost tracking
 * @returns {Promise<Object>} OpenAI API response
 */
const callLLMWithTimeout = async (messages, logger, traceId, userId) => {
  // Validate all messages have valid content (string, not null/undefined)
  const validatedMessages = messages.map(msg => ({
    ...msg,
    content: msg.content === null || msg.content === undefined ? "" : String(msg.content)
  }));
  
  logger.debug('Calling OpenAI API', { 
    messageCount: validatedMessages.length,
    lastMessageRole: validatedMessages[validatedMessages.length - 1]?.role
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`LLM API call timeout after ${LLM_TIMEOUT}ms`));
    }, LLM_TIMEOUT);
  });

  const apiCallPromise = openai.chat.completions.create({
    model: LLM_MODEL,
    messages: validatedMessages,
    tools: getToolDefinitions(),
    tool_choice: "auto", // Let model decide, but system prompt enforces tool usage
    max_tokens: MAX_RESPONSE_TOKENS,
    temperature: 0.7,
  });
  
  // Log tool definitions for debugging
  const toolDefs = getToolDefinitions();
  logger.debug('Tool definitions passed to LLM', { 
    toolCount: toolDefs.length,
    toolNames: toolDefs.map(t => t.function.name)
  });

  try {
    const response = await Promise.race([apiCallPromise, timeoutPromise]);
    
    // PRODUCTION: Track token usage for cost monitoring
    if (response.usage && userId) {
      recordUsage(
        userId,
        LLM_MODEL,
        response.usage.prompt_tokens || 0,
        response.usage.completion_tokens || 0,
        { traceId, operation: 'llm-chat' }
      );
    }
    
    return response;
  } catch (error) {
    logger.error('LLM API call failed', {
      traceId,
      error: error.message,
      timeout: LLM_TIMEOUT
    });
    throw error;
  }
};

/**
 * Fallback text parser for models that don't support proper tool calling
 * Parse tool calls from text output when LLM doesn't use proper tool calling format
 * Example: "[list_expenses(startDate=2026-01-31, endDate=2026-01-31)]"
 * 
 * Legacy Support:
 * --------------
 * Some local LLMs or older models write tool calls as text instead of
 * using the structured tool_calls format.
 * 
 * Note: This is NOT recommended for production as it's fragile.
 * Prefer models that support native tool calling (GPT-4, GPT-3.5-turbo, etc.)
 */
