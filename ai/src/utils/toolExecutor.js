/**
 * TOOL EXECUTION SAFETY WRAPPER
 * 
 * Production Problem This Solves:
 * --------------------------------
 * Tool executions can hang, timeout, or consume excessive resources:
 * - Backend API might not respond
 * - Network partition leaves request hanging
 * - No upper bound on execution time
 * 
 * Why This Matters for MCP Systems:
 * ---------------------------------
 * - Each tool call blocks LLM response generation
 * - Hanging tools = user waiting forever
 * - No resource cleanup for timed-out operations
 * - Multiple tool calls can compound the problem
 * 
 * MCP Best Practice:
 * ------------------
 * Every tool MUST have:
 * 1. Execution timeout
 * 2. Resource cleanup on failure
 * 3. Clear error propagation
 * 4. Observability (logging, metrics)
 * 
 * What Could Go Wrong Without This:
 * ---------------------------------
 * - User requests hang indefinitely
 * - Server resources exhausted (connection pools, memory)
 * - No way to detect slow tools for optimization
 * - Cascade failures when upstream is slow
 */

import { withRetry } from './retry.js';
import { createLogger } from './logger.js';
import { classifyError } from './errorClassification.js';
import { withIdempotency } from './idempotency.js';

const logger = createLogger('tool-executor');

/**
 * Tool operation types for idempotency configuration
 */
const ToolOperationType = {
  READ: 'read',    // Read-only, no idempotency needed
  WRITE: 'write',  // Write operation, idempotency required
  DELETE: 'delete' // Delete operation, idempotency required
};

/**
 * Maps tool names to their operation types
 * Used to determine idempotency behavior
 */
const TOOL_OPERATION_TYPES = {
  'create_expense': ToolOperationType.WRITE,
  'modify_expense': ToolOperationType.WRITE,
  'delete_expense': ToolOperationType.DELETE,
  'clear_expenses': ToolOperationType.DELETE,
  'list_expenses': ToolOperationType.READ
};

/**
 * Executes a tool with timeout, retry, idempotency, and observability
 * 
 * Safety Guarantees:
 * - Will timeout after specified duration
 * - Will retry transient failures automatically
 * - Will prevent duplicate writes via idempotency
 * - Will log all executions for audit trail
 * - Will classify errors for appropriate handling
 * 
 * @param {Function} toolFn - The tool implementation function
 * @param {Object} args - Tool arguments
 * @param {string} toolName - Tool name for logging
 * @param {Object} options - Execution options
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @param {number} options.maxRetries - Max retry attempts (default: 2)
 * @param {Object} options.context - Additional logging context (traceId, userId)
 * @returns {Promise<any>} Tool execution result
 */
export const executeToolSafely = async (toolFn, args, toolName, options = {}) => {
  const {
    timeout = 30000, // 30 seconds default
    maxRetries = 2,   // Retry twice for transient failures
    context = {}
  } = options;

  const startTime = Date.now();
  const userId = context.userId;
  
  // Determine if idempotency should be applied
  const operationType = TOOL_OPERATION_TYPES[toolName] || ToolOperationType.WRITE;
  const useIdempotency = operationType !== ToolOperationType.READ && userId;

  logger.info(`Executing tool: ${toolName}`, {
    toolName,
    args,
    timeout,
    maxRetries,
    operationType,
    useIdempotency,
    ...context
  });

  try {
    // Wrap execution with idempotency (for write operations only)
    const executeWithRetry = async () => {
      return await withRetry(
        () => toolFn(args),
        {
          maxRetries,
          operationName: `tool:${toolName}`,
          context: { toolName, ...context }
        }
      );
    };
    
    // Apply idempotency if needed
    const result = useIdempotency
      ? await withIdempotency(
          userId,
          toolName,
          args,
          () => executeWithTimeout(executeWithRetry(), timeout, toolName),
          { ttl: 24 * 60 * 60 * 1000 } // 24 hour cache
        )
      : await executeWithTimeout(executeWithRetry(), timeout, toolName);

    const duration = Date.now() - startTime;
    
    logger.info(`Tool execution successful: ${toolName}`, {
      toolName,
      duration,
      ...context
    });

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorClassification = error.classification || classifyError(error);

    logger.error(`Tool execution failed: ${toolName}`, {
      toolName,
      duration,
      category: errorClassification.category,
      message: errorClassification.message,
      retryable: errorClassification.retryable,
      ...context
    });

    // Enhance error with tool context before re-throwing
    error.toolName = toolName;
    error.toolArgs = args;
    error.classification = errorClassification;
    error.duration = duration;

    throw error;
  }
};

/**
 * Wraps a promise with a timeout
 * 
 * Critical for MCP Systems:
 * -------------------------
 * - Prevents indefinite waits
 * - Allows resource cleanup
 * - Provides clear timeout errors
 * 
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout duration
 * @param {string} operationName - Name for error message
 * @returns {Promise<any>} Result or timeout error
 */
const executeWithTimeout = async (promise, timeoutMs, operationName) => {
  let timeoutHandle;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const error = new Error(
        `Tool execution timeout: ${operationName} exceeded ${timeoutMs}ms`
      );
      error.code = 'TOOL_TIMEOUT';
      error.timeout = timeoutMs;
      reject(error);
    }, timeoutMs);
  });

  try {
    // Race between actual execution and timeout
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle);
    throw error;
  }
};

/**
 * Validates tool arguments before execution
 * 
 * MCP Best Practice:
 * ------------------
 * - Validate input BEFORE calling backend
 * - Fail fast on validation errors (don't waste API calls)
 * - Return clear validation messages to LLM
 * - Never trust LLM-generated arguments
 * 
 * @param {Object} args - Arguments to validate
 * @param {Object} schema - Validation schema
 * @param {string} toolName - Tool name for error messages
 * @throws {Error} ValidationError if invalid
 */
export const validateToolArgs = (args, schema, toolName) => {
  const errors = [];

  // Check required fields
  if (schema.required && Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (args[field] === undefined || args[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Type checking (basic)
  if (schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      if (args[field] !== undefined) {
        const actualType = typeof args[field];
        const expectedType = fieldSchema.type;

        if (expectedType === 'number' && actualType !== 'number') {
          errors.push(`Field '${field}' must be a number, got ${actualType}`);
        }
        if (expectedType === 'string' && actualType !== 'string') {
          errors.push(`Field '${field}' must be a string, got ${actualType}`);
        }
        if (expectedType === 'boolean' && actualType !== 'boolean') {
          errors.push(`Field '${field}' must be a boolean, got ${actualType}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    const error = new Error(
      `Tool validation failed for ${toolName}: ${errors.join('; ')}`
    );
    error.name = 'ValidationError';
    error.validationErrors = errors;
    error.toolName = toolName;
    throw error;
  }
};
