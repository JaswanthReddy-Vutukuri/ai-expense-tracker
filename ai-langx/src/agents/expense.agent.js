/**
 * EXPENSE AGENT - LangChain Agent Implementation
 * 
 * PURPOSE:
 * - Orchestrates tool-calling for expense operations via LangChain's agent pattern
 * - Implements ReAct pattern (Reason + Act) with automatic tool-calling loop
 * - Demonstrates production-level LangChain architecture
 * 
 * LANGCHAIN ARCHITECTURE CONCEPTS:
 * ✅ createOpenAIToolsAgent: Builds agent for OpenAI tool-calling API
 * ✅ AgentExecutor: Manages the agent loop automatically (Reason → Act → Observe)
 * ✅ Tool binding: LLM receives tool schemas and can invoke them
 * ✅ Max iterations: Safety limit prevents infinite loops
 * ✅ Early stopping: Detects when agent has finished
 * ✅ LangSmith tracing: Automatic observability of all steps
 * 
 * COMPARE WITH: ai/src/llm/agent.js (custom tool-calling loop)
 * 
 * KEY ARCHITECTURAL DIFFERENCE:
 * - Custom: Manual while loop, manual tool execution, manual state management
 * - LangChain: Framework handles loop, tool execution, intermediate steps, error handling
 * 
 * PRODUCTION BENEFITS:
 * - Consistent behavior across all agents
 * - Built-in retry logic and timeout handling
 * - Automatic LangSmith tracing of all steps
 * - Better error recovery and handling
 * - Easy to extend with memory, retrieval, etc.
 * 
 * LEARNING RESOURCES:
 * - See ai/src/llm/agent.js for the manual loop implementation
 * - Compare token usage: custom vs framework approach
 * - Observe LangSmith tracing in dashboard for production monitoring
 */

import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { PromptTemplate, ChatPromptTemplate } from "@langchain/core/prompts";
import { createLLM } from '../config/llm.config.js';
import { getSystemPromptText } from '../prompts/system.prompt.js';
import { createToolsWithContext } from '../tools/index.js';
import { getTraceTags, getTraceMetadata } from '../config/langsmith.config.js';

/**
 * Agent Configuration
 * These safety limits are critical for production
 */
const AGENT_CONFIG = {
  MAX_ITERATIONS: parseInt(process.env.MAX_AGENT_ITERATIONS) || 5,
  TIMEOUT_MS: parseInt(process.env.AGENT_TIMEOUT_MS) || 60000,
  VERBOSE: process.env.NODE_ENV === 'development'
};

/**
 * Create expense agent executor using LangChain's agent pattern
 * 
 * LANGCHAIN AGENT PATTERN (Production Standard):
 * 
 * 1. CREATE LLM
 *    └─ Configured with tool-calling capability
 *    └─ Tagged for LangSmith tracing
 * 
 * 2. CREATE TOOLS
 *    └─ StructuredTool instances with Zod schemas
 *    └─ Tools know how to execute via _call() method
 * 
 * 3. CREATE PROMPT
 *    └─ System: Instructions for how to use tools
 *    └─ Human: User's request
 *    └─ Agent scratchpad: Space for reasoning
 * 
 * 4. CREATE AGENT
 *    └─ createOpenAIToolsAgent: Handles OpenAI function-calling format
 *    └─ Binds language model and tools together
 * 
 * 5. CREATE EXECUTOR
 *    └─ AgentExecutor: Manages the Reason → Act → Observe loop
 *    └─ Returns when agent decides it's done
 * 
 * The framework handles:
 * - Passing tool schemas to LLM
 * - Parsing tool calls from LLM responses
 * - Executing tools with proper error handling
 * - Adding tool results back to conversation
 * - Continuing loop until agent decides to stop
 * 
 * @param {string} authToken - JWT for backend auth
 * @param {Object} context - Request context (userId, traceId)
 * @returns {Promise<AgentExecutor>} Fully configured agent executor
 * @throws {Error} If agent creation fails
 */
export const createExpenseAgent = async (authToken, context = {}) => {
  try {
    console.log('[ExpenseAgent] Starting agent creation...');
    
    // STEP 1: Create LLM with tool-calling capability
    // With temperature=0.7 to match working ai/ implementation
    console.log('[ExpenseAgent] Creating LLM instance...');
    const llm = createLLM({
      temperature: 0.7, // Same as working ai/ - allows more natural tool usage
      tags: getTraceTags('transactional', context.userId),
      metadata: getTraceMetadata(context.traceId, context.userId)
    });
    
    // STEP 2: Create tools with authentication context
    // Each tool is a StructuredTool with Zod schema validation
    console.log('[ExpenseAgent] Creating tools with context...');
    const tools = createToolsWithContext(authToken, context);
    console.log(`[ExpenseAgent] Created ${tools.length} tools:`, tools.map(t => t.name).join(', '));
    
    // STEP 3: Create system prompt with date context
    // This guides the agent on when and how to use tools
    console.log('[ExpenseAgent] Getting system prompt text...');
    const systemPromptText = getSystemPromptText();
    console.log('[ExpenseAgent] System prompt length:', systemPromptText.length);
    console.log('[ExpenseAgent] System prompt preview:', systemPromptText.substring(0, 200));
    
    // STEP 4: Create the prompt template
    // This structure is required by createOpenAIToolsAgent
    // CRITICAL: System message must NOT have template variables - they should be pre-filled
    // INCLUDES conversation history to support confirmation workflows
    console.log('[ExpenseAgent] Building prompt template...');
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", systemPromptText],
      ["placeholder", "{chat_history}"], // ← Added for conversation history
      ["human", "{input}"],
      ["placeholder", "{agent_scratchpad}"]
    ]);
    
    console.log('[ExpenseAgent] Prompt template created');
    console.log('[ExpenseAgent] DEBUG - Tool details:');
    tools.forEach(tool => {
      console.log(`  - ${tool.name}:`, {
        description: tool.description.substring(0, 100),
        schema: tool.schema ? 'Present' : 'Missing'
      });
    });
    
    // STEP 5: Create the agent
    // createOpenAIToolsAgent specifically handles OpenAI's tool-calling API format
    // It handles:
    // - Converting Zod schemas to OpenAI function format
    // - Parsing function_call responses from OpenAI
    // - Formatting messages correctly
    console.log('[ExpenseAgent] Creating agent with createOpenAIToolsAgent...');
    const agent = await createOpenAIToolsAgent({
      llm,
      tools,
      prompt
    });
    
    console.log('[ExpenseAgent] Agent created successfully');
    
    // STEP 6: Wrap in AgentExecutor
    // The executor manages the agent loop:
    // Loop each iteration:
    //   - Call LLM with current state
    //   - Check if tool was called
    //   - If yes: execute tool, add result to state, continue loop
    //   - If no: return agent's final answer
    console.log('[ExpenseAgent] Creating AgentExecutor...');
    const executor = new AgentExecutor({
      agent,
      tools,
      // SAFETY: Maximum number of iterations to prevent infinite loops
      maxIterations: AGENT_CONFIG.MAX_ITERATIONS,
      // DEBUGGING: Log intermediate steps in development
      verbose: AGENT_CONFIG.VERBOSE,
      // ERROR HANDLING: Don't crash if tool returns invalid output
      handleParsingErrors: true,
      // OBSERVABILITY: Return details of all tool calls for monitoring
      returnIntermediateSteps: true,
      // LANGSMITH: Automatically traced via tags/metadata from llm
    });
    
    console.log('[ExpenseAgent] Agent executor created successfully');
    return executor;
    
  } catch (error) {
    const errorMsg = error?.message || String(error) || 'Unknown error';
    console.error('[ExpenseAgent] Error creating agent:', {
      message: errorMsg,
      stack: error?.stack?.substring(0, 300)
    });
    throw error;
  }
};

/**
 * Execute agent with user message
 * 
 * THIS IS THE PRODUCTION EXECUTION PATTERN:
 * 
 * 1. Input Validation
 *    └─ Guard against malformed input
 * 
 * 2. Agent Creation
 *    └─ Creates fresh agent per request (stateless)
 *    └─ Injects context (userId, traceId) for observability
 * 
 * 3. Agent Execution
 *    └─ AgentExecutor.invoke() manages the entire loop
 *    └─ Handles tool-calling, results, retries automatically
 *    └─ Returns final output when agent decides to stop
 * 
 * 4. Error Handling
 *    └─ Timeout protection (Promise.race)
 *    └─ User-friendly error messages
 *    └─ Detailed logging for debugging
 * 
 * KEY: We DON'T manually loop - AgentExecutor does that!
 * 
 * @param {string} message - User's natural language input
 * @param {string} authToken - JWT token
 * @param {Array} history - Conversation history (optional)
 * @param {Object} context - Request context
 * @returns {Promise<string>} Agent's response
 */
export const executeExpenseAgent = async (message, authToken, history = [], context = {}) => {
  const startTime = Date.now();
  
  // Guard against undefined message
  if (!message || typeof message !== 'string') {
    console.warn('[ExpenseAgent] Invalid message:', typeof message, message);
    return `I didn't receive your message properly. Please try again.`;
  }
  
  try {
    console.log('[ExpenseAgent] Executing:', {
      message: message.substring(0, 100),
      userId: context.userId,
      traceId: context.traceId,
      historyLength: history.length
    });
    
    // Create agent executor
    const executor = await createExpenseAgent(authToken, context);
    
    console.log('[ExpenseAgent] Executor created, invoking with message...');
    
    // Convert conversation history to LangChain message format
    const chatHistory = history.map(msg => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content);
      } else if (msg.role === 'assistant') {
        return new AIMessage(msg.content);
      } else {
        return new SystemMessage(msg.content);
      }
    });
    
    console.log('[ExpenseAgent] Chat history converted:', chatHistory.length, 'messages');
    
    // Execute agent with timeout protection
    try {
      const result = await Promise.race([
        executor.invoke({
          input: message,
          chat_history: chatHistory // ← Pass conversation history
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Agent execution timeout')), AGENT_CONFIG.TIMEOUT_MS)
        )
      ]);
      
      const duration = Date.now() - startTime;
      
      const finalOutput = result.output || result;
      
      console.log('[ExpenseAgent] Complete:', {
        duration: `${duration}ms`,
        iterations: result.intermediateSteps?.length || 0,
        traceId: context.traceId,
        hasToolCalls: (result.intermediateSteps?.length || 0) > 0,
        output: typeof finalOutput === 'string' ? finalOutput.substring(0, 200) : 'non-string output'
      });
      
      // DEBUG: Log full result structure
      console.log('[ExpenseAgent] Full result keys:', Object.keys(result));
      console.log('[ExpenseAgent] Has intermediateSteps:', !!result.intermediateSteps);
      console.log('[ExpenseAgent] intermediateSteps length:', result.intermediateSteps?.length || 0);
      
      // Log intermediate steps for debugging
      if (result.intermediateSteps && result.intermediateSteps.length > 0) {
        console.log('[ExpenseAgent] Intermediate steps:');
        result.intermediateSteps.forEach((step, idx) => {
          const obs = step.observation?.substring ? step.observation.substring(0, 100) : step.observation;
          console.log(`  [${idx}] Tool: ${step.action.tool}`, {
            input: step.action.toolInput,
            observation: obs
          });
        });
      }
      
      return finalOutput;
    } catch (invokeError) {
      console.error('[ExpenseAgent] Invoke error caught');
      
      // Safely extract error details
      const errName = invokeError?.name || 'Unknown';
      const errMsg = invokeError?.message || String(invokeError) || 'Unknown error';
      const errStack = invokeError?.stack || 'No stack trace';
      
      console.error('[ExpenseAgent] Invoke error details:', {
        errorName: errName,
        errorMessage: errMsg,
        errorStack: errStack?.substring(0, 500)
      });
      throw invokeError;
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Guard against undefined error object
    const errorMessage = error?.message || String(error) || 'Unknown error';
    
    console.error('[ExpenseAgent] Error:', {
      message: errorMessage,
      duration: `${duration}ms`,
      traceId: context.traceId
    });
    
    // Classify errors for user-friendly messages
    if (errorMessage && errorMessage.includes('timeout')) {
      return `⚠️ Request timed out after ${AGENT_CONFIG.TIMEOUT_MS/1000} seconds. Please try again or simplify your request.`;
    }
    
    if (errorMessage && errorMessage.includes('rate limit')) {
      return `⚠️ Too many requests. Please wait a moment and try again.`;
    }
    
    if (errorMessage && errorMessage.includes('parsing')) {
      return `⚠️ I had trouble understanding the response. Please try rephrasing your request.`;
    }
    
    // Generic error
    const finalErrorMsg = `⚠️ Sorry, I encountered an error: ${errorMessage}. Please try again.`;
    console.log('[ExpenseAgent] Returning error message to user:', finalErrorMsg);
    return finalErrorMsg;
  }
};

/**
 * COMPARISON: Custom vs LangChain Agent
 * 
 * ┌──────────────────────────┬────────────────────────┬────────────────────────┐
 * │ Feature                  │ Custom (ai/)           │ LangChain (ai-langx/)  │
 * ├──────────────────────────┼────────────────────────┼────────────────────────┤
 * │ Tool Calling Loop        │ Manual while loop      │ AgentExecutor built-in │
 * │ Max Iterations           │ Custom check           │ Built-in config        │
 * │ Tool Binding             │ Manual registration    │ Automatic binding      │
 * │ Error Handling           │ try/catch + classify   │ Built-in + custom      │
 * │ Timeout Protection       │ Custom setTimeout      │ Promise.race           │
 * │ Intermediate Steps       │ Manual logging         │ returnIntermediateSteps│
 * │ Tracing                  │ Manual logger          │ Automatic LangSmith    │
 * │ Conversation History     │ Manual format          │ chat_history param     │
 * │ Parsing Errors           │ Custom handling        │ handleParsingErrors    │
 * │ Retry Logic              │ Custom implementation  │ LLM config             │
 * │ Code Complexity          │ ~200 LOC               │ ~50 LOC                │
 * └──────────────────────────┴────────────────────────┴────────────────────────┘
 * 
 * WHEN TO USE LANGCHAIN AGENT:
 * ✅ Standard tool-calling pattern
 * ✅ Want automatic tracing
 * ✅ Need conversation memory
 * ✅ Integrating with other LangChain components
 * ✅ Want to swap LLM providers easily
 * 
 * WHEN TO USE CUSTOM AGENT:
 * ✅ Highly specialized control flow
 * ✅ Need custom tool selection logic
 * ✅ Want zero framework dependencies
 * ✅ Custom safety requirements beyond framework
 * 
 * LEARNING NOTE:
 * Both approaches are valid! LangChain reduces boilerplate but adds abstraction.
 * Custom gives full control but requires more maintenance.
 * 
 * For this reference implementation, we demonstrate LangChain to show
 * how frameworks can accelerate development while maintaining safety.
 */
