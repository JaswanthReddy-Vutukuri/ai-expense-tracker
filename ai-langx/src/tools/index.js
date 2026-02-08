/**
 * LANGCHAIN TOOLS - MCP WRAPPER IMPLEMENTATION
 * 
 * PURPOSE:
 * - Converts existing MCP tools to LangChain StructuredTool format
 * - Demonstrates LangChain tool pattern
 * - Maintains same safety and validation as custom implementation
 * 
 * KEY DIFFERENCES FROM CUSTOM:
 * ✅ Zod schema for automatic validation (vs manual JSON schema)
 * ✅ StructuredTool base class (vs plain objects)
 * ✅ Automatic OpenAI function schema conversion
 * ✅ Built-in error handling via callbacks
 * ✅ Automatic LangSmith tracing
 * 
 * SAME AS CUSTOM:
 * ✅ Backend API calls remain the same
 * ✅ Authentication via JWT token
 * ✅ User isolation
 * ✅ Error classification
 * 
 * LEARNING NOTE:
 * Compare this file with ai/src/mcp/tools/index.js to understand
 * the mapping between custom and framework approaches.
 */

import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { CreateExpenseTool } from './createExpense.tool.js';
import { ListExpensesTool } from './listExpenses.tool.js';
import { ModifyExpenseTool } from './modifyExpense.tool.js';
import { DeleteExpenseTool } from './deleteExpense.tool.js';
import { ClearExpensesTool } from './clearExpenses.tool.js';

/**
 * Tool Registry
 * 
 * WHY THIS EXISTS:
 * - Central registration point for all tools
 * - Makes tools discoverable by agents
 * - Enables dynamic tool selection
 * 
 * LANGCHAIN BENEFIT:
 * - Tools can be passed directly to agent executors
 * - No manual schema conversion needed
 * - Automatic validation via Zod
 */

/**
 * Creates tool instances with runtime context
 * 
 * @param {string} authToken - JWT token for backend authentication
 * @param {Object} context - Request context (userId, traceId)
 * @returns {Array<StructuredTool>} Array of LangChain tools
 * 
 * PATTERN NOTE:
 * In LangChain, tools are typically instantiated per-request to inject
 * request-specific context (auth token, user ID, etc.)
 * 
 * Compare with custom approach where context is passed to executeTool()
 */
export const createToolsWithContext = (authToken, context = {}) => {
  return [
    new CreateExpenseTool(authToken, context),
    new ListExpensesTool(authToken, context),
    new ModifyExpenseTool(authToken, context),
    new DeleteExpenseTool(authToken, context),
    new ClearExpensesTool(authToken, context)
  ];
};

/**
 * Get tool schemas for LLM
 * 
 * LANGCHAIN AUTO-CONVERSION:
 * LangChain automatically converts Zod schemas to OpenAI function calling format
 * No manual schema definition needed (vs custom implementation)
 * 
 * @param {Array<StructuredTool>} tools - Tool instances
 * @returns {Array<Object>} OpenAI-compatible tool schemas
 */
export const getToolSchemas = (tools) => {
  return tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema // Zod schema auto-converted
    }
  }));
};

/**
 * Execute tool by name
 * 
 * LANGCHAIN PATTERN:
 * Tools have built-in _call() method that handles:
 * - Argument validation (automatic via Zod)
 * - Error handling (via callbacks)
 * - Tracing (via LangSmith)
 * 
 * Compare with custom executeTool() which manually:
 * - Finds tool by name
 * - Validates arguments
 * - Wraps in timeout/retry logic
 * 
 * @param {Array<StructuredTool>} tools - Tool instances
 * @param {string} toolName - Name of tool to execute
 * @param {Object} args - Tool arguments
 * @returns {Promise<any>} Tool execution result
 */
export const executeToolByName = async (tools, toolName, args) => {
  const tool = tools.find(t => t.name === toolName);
  
  if (!tool) {
    throw new Error(`Tool '${toolName}' not found`);
  }
  
  // LangChain StructuredTool automatically:
  // 1. Validates args against Zod schema
  // 2. Calls _call() method
  // 3. Traces execution in LangSmith
  // 4. Handles errors via callbacks
  return await tool.call(args);
};

/**
 * Get tool names (for debugging/logging)
 */
export const getToolNames = (tools) => {
  return tools.map(t => t.name);
};

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * ┌─────────────────────────┬────────────────────────┬───────────────────────┐
 * │ Feature                 │ Custom (ai/)           │ LangChain (ai-langx/) │
 * ├─────────────────────────┼────────────────────────┼───────────────────────┤
 * │ Schema Definition       │ Manual JSON Schema     │ Zod (type-safe)       │
 * │ Validation              │ Custom validator       │ Automatic (Zod)       │
 * │ Tool Structure          │ Plain object           │ StructuredTool class  │
 * │ Execution               │ executeToolSafely()    │ tool.call()           │
 * │ Timeout/Retry           │ Custom wrapper         │ Callbacks + config    │
 * │ Tracing                 │ Manual logging         │ Automatic LangSmith   │
 * │ Error Handling          │ errorClassification.js │ Callbacks + built-in  │
 * │ Context Propagation     │ Manual parameter       │ Constructor injection │
 * └─────────────────────────┴────────────────────────┴───────────────────────┘
 * 
 * WHEN TO USE WHICH:
 * - Custom: Need 100% control over execution, minimal dependencies
 * - LangChain: Want type safety, automatic tracing, framework integration
 */
