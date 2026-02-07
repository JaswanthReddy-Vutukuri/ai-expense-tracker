/**
 * RETRY LOGIC WITH EXPONENTIAL BACKOFF
 * 
 * Production Problem This Solves:
 * --------------------------------
 * Distributed systems have transient failures:
 * - Network hiccups
 * - Temporary service overload
 * - Database connection pool exhaustion
 * - Rate limiting
 * 
 * Without retry logic:
 * - Users see errors for temporary issues
 * - System appears unreliable
 * - Manual retry burden on users
 * 
 * Why This Matters for MCP Systems:
 * ---------------------------------
 * - Tool executions call external APIs (backend, LLM)
 * - Each call can fail transiently
 * - LLM API calls cost money → can't retry blindly
 * - Must distinguish transient (retry) vs permanent (fail fast)
 * 
 * What Could Go Wrong Without This:
 * ---------------------------------
 * - Good requests fail due to temporary glitches
 * - Thundering herd if all retries happen simultaneously
 * - Cascading failures if retry logic is too aggressive
 * - Wasted money retrying non-retryable errors
 */

import { classifyError, shouldRetry, calculateBackoff } from './errorClassification.js';
import { createLogger } from './logger.js';

const logger = createLogger('retry-handler');

/**
 * Executes a function with automatic retry on transient failures
 * 
 * Features:
 * - Intelligent retry decision based on error classification
 * - Exponential backoff with jitter (prevents thundering herd)
 * - Configurable max attempts
 * - Detailed logging for debugging
 * 
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry configuration
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {string} options.operationName - Name for logging (default: 'operation')
 * @param {Object} options.context - Additional context for logging
 * @returns {Promise<any>} Result of successful execution
 * @throws {Error} If all retry attempts fail
 */
export const withRetry = async (fn, options = {}) => {
  const {
    maxRetries = 3,
    operationName = 'operation',
    context = {}
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Attempt execution
      logger.debug(`Executing ${operationName}`, {
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
        ...context
      });

      const result = await fn();

      // Success!
      if (attempt > 0) {
        logger.info(`${operationName} succeeded after ${attempt} retries`, context);
      }

      return result;

    } catch (error) {
      lastError = error;
      
      // Classify the error to determine if we should retry
      const errorClassification = classifyError(error);

      logger.warn(`${operationName} failed`, {
        attempt: attempt + 1,
        category: errorClassification.category,
        message: errorClassification.message,
        retryable: errorClassification.retryable,
        ...context
      });

      // Check if we should retry
      const willRetry = shouldRetry(errorClassification, attempt, maxRetries);

      if (!willRetry) {
        // Non-retryable or max attempts reached
        if (errorClassification.retryable === false) {
          logger.error(`${operationName} failed with non-retryable error`, {
            category: errorClassification.category,
            message: errorClassification.message,
            ...context
          });
        } else {
          logger.error(`${operationName} failed after ${attempt + 1} attempts`, {
            category: errorClassification.category,
            ...context
          });
        }
        
        // Enhance error with classification metadata before throwing
        error.classification = errorClassification;
        throw error;
      }

      // Calculate backoff delay
      const delay = calculateBackoff(attempt, errorClassification);
      
      logger.info(`Retrying ${operationName} in ${delay}ms`, {
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        delay,
        ...context
      });

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but just in case
  logger.error(`${operationName} exhausted all retries`, context);
  lastError.classification = classifyError(lastError);
  throw lastError;
};

/**
 * Helper sleep function for explicit delays
 * @param {number} ms - Milliseconds to sleep
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
