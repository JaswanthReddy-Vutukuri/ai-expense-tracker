/**
 * ERROR CLASSIFICATION SYSTEM
 * 
 * Production Problem This Solves:
 * --------------------------------
 * Not all errors are equal. Different errors require different handling:
 * - Validation errors → return to user for correction
 * - Transient errors → retry automatically
 * - Fatal errors → fail fast, alert engineering
 * 
 * Why This Matters for MCP Systems:
 * ---------------------------------
 * - Tool executions can fail in many ways
 * - Some failures are user's fault (bad input)
 * - Some failures are temporary (network glitch)
 * - Some failures are bugs (should page on-call)
 * - Retrying validation errors wastes tokens and money
 * - Not retrying transient errors provides bad UX
 * 
 * What Could Go Wrong Without This:
 * ---------------------------------
 * - Retrying validation errors → wasted API calls & money
 * - Not retrying transient errors → user sees failures for temporary issues
 * - Treating all errors the same → can't build intelligent retry logic
 * - No distinction between user error vs system error → bad monitoring
 */

/**
 * Error categories for MCP systems
 */
export const ErrorCategory = {
  // User provided bad input → return immediately, don't retry
  VALIDATION: 'VALIDATION',
  
  // User not authorized → return immediately, don't retry
  AUTHORIZATION: 'AUTHORIZATION',
  
  // Temporary failure → safe to retry with backoff
  TRANSIENT: 'TRANSIENT',
  
  // Upstream service error → might be transient, limited retry
  UPSTREAM: 'UPSTREAM',
  
  // Rate limit hit → retry with longer backoff
  RATE_LIMIT: 'RATE_LIMIT',
  
  // System bug or misconfiguration → fail fast, alert
  FATAL: 'FATAL',
  
  // Unknown error type → treat as fatal
  UNKNOWN: 'UNKNOWN'
};

/**
 * Classifies an error into appropriate category
 * 
 * @param {Error} error - The error to classify
 * @returns {Object} { category, message, retryable, userFacing }
 */
export const classifyError = (error) => {
  // Axios error from backend API call
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;

    // 4xx errors are typically client/validation issues
    if (status >= 400 && status < 500) {
      if (status === 401 || status === 403) {
        return {
          category: ErrorCategory.AUTHORIZATION,
          message: data?.message || 'Authorization failed',
          retryable: false,
          userFacing: true,
          httpStatus: status
        };
      }

      if (status === 429) {
        return {
          category: ErrorCategory.RATE_LIMIT,
          message: 'Rate limit exceeded, please try again later',
          retryable: true,
          userFacing: true,
          httpStatus: status,
          retryAfter: error.response.headers['retry-after'] || 60
        };
      }

      // 400, 404, 422 etc → validation/not found
      return {
        category: ErrorCategory.VALIDATION,
        message: data?.message || 'Invalid request',
        retryable: false,
        userFacing: true,
        httpStatus: status,
        details: data?.details || data?.error
      };
    }

    // 5xx errors are server-side issues
    if (status >= 500) {
      return {
        category: ErrorCategory.UPSTREAM,
        message: 'Backend service error',
        retryable: true, // Backend might recover
        userFacing: false,
        httpStatus: status
      };
    }
  }

  // Network errors (no response received)
  if (error.request && !error.response) {
    return {
      category: ErrorCategory.TRANSIENT,
      message: 'Network error - service unreachable',
      retryable: true,
      userFacing: false,
      code: error.code
    };
  }

  // OpenAI/LLM API errors
  if (error.status) {
    if (error.status === 401) {
      return {
        category: ErrorCategory.FATAL,
        message: 'LLM API key invalid or expired',
        retryable: false,
        userFacing: false
      };
    }

    if (error.status === 429) {
      return {
        category: ErrorCategory.RATE_LIMIT,
        message: 'LLM API rate limit exceeded',
        retryable: true,
        userFacing: false,
        retryAfter: 30
      };
    }

    if (error.status >= 500) {
      return {
        category: ErrorCategory.TRANSIENT,
        message: 'LLM service temporarily unavailable',
        retryable: true,
        userFacing: false
      };
    }
  }

  // Timeout errors
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
    return {
      category: ErrorCategory.TRANSIENT,
      message: 'Request timeout',
      retryable: true,
      userFacing: false,
      code: error.code
    };
  }

  // Custom validation errors (thrown by our code)
  if (error.name === 'ValidationError' || error.message?.includes('validation')) {
    return {
      category: ErrorCategory.VALIDATION,
      message: error.message,
      retryable: false,
      userFacing: true
    };
  }

  // Tool execution timeout (custom error from our code)
  if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
    return {
      category: ErrorCategory.TRANSIENT,
      message: 'Operation timed out',
      retryable: true,
      userFacing: false
    };
  }

  // Unknown error → treat as fatal for safety
  return {
    category: ErrorCategory.UNKNOWN,
    message: error.message || 'Unknown error',
    retryable: false,
    userFacing: false
  };
};

/**
 * Determines if an error should be retried based on its classification
 * 
 * @param {Object} errorClassification - Result from classifyError()
 * @param {number} attemptNumber - Current retry attempt (0-indexed)
 * @param {number} maxRetries - Maximum retry attempts allowed
 * @returns {boolean} True if should retry
 */
export const shouldRetry = (errorClassification, attemptNumber, maxRetries = 3) => {
  if (attemptNumber >= maxRetries) {
    return false;
  }

  return errorClassification.retryable === true;
};

/**
 * Calculates backoff delay for retry attempts
 * Uses exponential backoff with jitter to prevent thundering herd
 * 
 * @param {number} attemptNumber - Current retry attempt (0-indexed)
 * @param {Object} errorClassification - Result from classifyError()
 * @returns {number} Delay in milliseconds
 */
export const calculateBackoff = (attemptNumber, errorClassification) => {
  // Rate limit errors: respect retry-after header if present
  if (errorClassification.category === ErrorCategory.RATE_LIMIT && errorClassification.retryAfter) {
    return errorClassification.retryAfter * 1000; // Convert to ms
  }

  // Exponential backoff: 1s, 2s, 4s, 8s...
  const baseDelay = 1000;
  const exponentialDelay = baseDelay * Math.pow(2, attemptNumber);
  
  // Add jitter (±25%) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
  
  return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
};

/**
 * Generates a user-friendly error message
 * Hides technical details from users while preserving them for logs
 * 
 * @param {Object} errorClassification - Result from classifyError()
 * @returns {string} User-friendly message
 */
export const getUserMessage = (errorClassification) => {
  if (errorClassification.userFacing && errorClassification.message) {
    return errorClassification.message;
  }

  // Generic fallback for internal errors
  switch (errorClassification.category) {
    case ErrorCategory.TRANSIENT:
      return 'A temporary issue occurred. Please try again in a moment.';
    case ErrorCategory.UPSTREAM:
      return 'Our backend service is experiencing issues. Please try again later.';
    case ErrorCategory.RATE_LIMIT:
      return 'You\'re doing that too quickly. Please wait a moment and try again.';
    case ErrorCategory.FATAL:
      return 'A system error occurred. Our team has been notified.';
    default:
      return 'An unexpected error occurred. Please try again or contact support.';
  }
};
