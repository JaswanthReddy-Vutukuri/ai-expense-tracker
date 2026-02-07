/**
 * STRUCTURED LOGGING UTILITY
 * 
 * Production Problem This Solves:
 * --------------------------------
 * Console.log is insufficient for production because:
 * 1. No request correlation (can't trace a request through multiple services)
 * 2. No structured data (hard to query/filter logs)
 * 3. No log levels (can't filter by severity)
 * 4. No metadata (user context, performance metrics missing)
 * 
 * Why This Matters for MCP Systems:
 * ---------------------------------
 * - Tool executions span multiple services (AI → Backend)
 * - Need to trace failures across the entire call chain
 * - Need to audit who did what (regulatory compliance)
 * - Need to measure latency at each stage for optimization
 * 
 * What Could Go Wrong Without This:
 * ---------------------------------
 * - Can't debug production issues (logs are unstructured noise)
 * - Can't identify slow tool calls
 * - Can't correlate user actions with backend failures
 * - No audit trail for financial operations
 */

import crypto from 'crypto';

// Log levels (ordered by severity)
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

// Current log level from environment (default: INFO)
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// Enable JSON output for production log aggregation
const USE_JSON_OUTPUT = process.env.LOG_FORMAT === 'json';

/**
 * Generates a unique trace ID for request correlation
 * Format: tr_<timestamp>_<random>
 * 
 * This allows tracing a single user request through:
 * - Intent classification
 * - Multiple tool executions
 * - Backend API calls
 * - Final response generation
 */
export const generateTraceId = () => {
  return `tr_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
};

/**
 * Base logger class with structured output
 */
class Logger {
  constructor(context = 'default') {
    this.context = context;
  }

  /**
   * Internal log formatter
   * Produces either JSON (for production) or pretty-printed (for development)
   */
  _log(level, message, metadata = {}) {
    if (LOG_LEVELS[level] < CURRENT_LOG_LEVEL) {
      return; // Skip logs below current level
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...metadata
    };

    if (USE_JSON_OUTPUT) {
      // Production: JSON for log aggregation (Splunk, Datadog, etc.)
      console.log(JSON.stringify(logEntry));
    } else {
      // Development: Pretty-printed for readability
      const prefix = `[${level}] [${this.context}]`;
      const metaStr = Object.keys(metadata).length > 0 
        ? `\n  ${JSON.stringify(metadata, null, 2)}`
        : '';
      console.log(`${prefix} ${message}${metaStr}`);
    }
  }

  debug(message, metadata) {
    this._log('DEBUG', message, metadata);
  }

  info(message, metadata) {
    this._log('INFO', message, metadata);
  }

  warn(message, metadata) {
    this._log('WARN', message, metadata);
  }

  error(message, metadata) {
    this._log('ERROR', message, metadata);
  }

  fatal(message, metadata) {
    this._log('FATAL', message, metadata);
  }

  /**
   * Creates a child logger with additional context
   * Useful for adding traceId to all logs within a request
   * 
   * Example:
   *   const requestLogger = logger.child({ traceId: 'tr_123', userId: 42 });
   *   requestLogger.info('Processing tool call'); // includes traceId and userId
   */
  child(additionalContext) {
    const childLogger = new Logger(this.context);
    const originalLog = childLogger._log.bind(childLogger);
    childLogger._log = (level, message, metadata = {}) => {
      originalLog(level, message, { ...additionalContext, ...metadata });
    };
    return childLogger;
  }
}

// Export pre-configured loggers for different modules
export const createLogger = (context) => new Logger(context);

// Default logger instance
export const logger = new Logger('ai-orchestrator');
