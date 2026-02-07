import { createExpenseTool } from './createExpense.js';
import { listExpensesTool } from './listExpenses.js';
import { modifyExpenseTool } from './modifyExpense.js';
import { deleteExpenseTool } from './deleteExpense.js';
import { clearExpensesTool } from './clearExpenses.js';
import { executeToolSafely, validateToolArgs } from '../../utils/toolExecutor.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('mcp-tools');

// Registry of all available tools
export const tools = [
  createExpenseTool,
  listExpensesTool,
  modifyExpenseTool,
  deleteExpenseTool,
  clearExpensesTool
];

/**
 * Returns tool definitions formatted for OpenAI's tools parameter
 */
export const getToolDefinitions = () => tools.map(t => t.definition);

/**
 * Finds and executes a tool implementation with full production safety
 * 
 * Production Hardening:
 * --------------------
 * - Validates tool arguments before execution (fail fast on bad input)
 * - Wraps execution in timeout protection (30s default)
 * - Applies retry logic for transient failures
 * - Logs all executions for audit trail
 * - Classifies errors for appropriate handling
 * 
 * MCP Best Practice:
 * ------------------
 * NEVER call backend APIs directly from LLM-generated code.
 * ALWAYS route through validated, monitored tool wrappers.
 * This ensures:
 * - Security (authentication, authorization)
 * - Validation (prevent invalid data from reaching backend)
 * - Observability (logging, metrics, tracing)
 * - Reliability (timeouts, retries, error handling)
 * 
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments (from LLM)
 * @param {string} token - JWT token for backend authentication
 * @param {Object} context - Request context (traceId, userId)
 * @returns {Promise<any>} Tool execution result
 */
export const executeTool = async (name, args, token, context = {}) => {
  logger.info('executeTool called', { 
    toolName: name, 
    args, 
    hasToken: !!token,
    tokenPreview: token ? token.substring(0, 20) + '...' : 'none',
    ...context 
  });
  
  const tool = tools.find(t => t.definition.function.name === name);
  
  if (!tool) {
    const error = new Error(`Tool implementation for '${name}' not found.`);
    error.name = 'ValidationError';
    logger.error('Tool not found', { toolName: name, ...context });
    throw error;
  }
  
  logger.debug('Tool found', { toolName: name });

  // PRODUCTION SAFETY: Validate arguments against tool schema
  try {
    const schema = tool.definition.function.parameters;
    validateToolArgs(args, schema, name);
  } catch (validationError) {
    logger.warn('Tool argument validation failed', {
      toolName: name,
      args,
      error: validationError.message,
      ...context
    });
    throw validationError;
  }

  // Execute with full production safety (timeout, retry, logging)
  return await executeToolSafely(
    // Tool implementation
    (toolArgs) => tool.run(toolArgs, token),
    // Arguments
    args,
    // Tool name
    name,
    // Options
    {
      timeout: 30000,  // 30 second timeout per tool
      maxRetries: 2,   // Retry transient failures
      context          // Pass through for logging
    }
  );
};

