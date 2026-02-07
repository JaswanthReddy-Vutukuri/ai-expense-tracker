/**
 * IDEMPOTENCY SYSTEM FOR MCP TOOLS
 * 
 * Production Problem This Solves:
 * --------------------------------
 * Network issues can cause retries, leading to duplicate operations:
 * - Client doesn't receive response (network timeout)
 * - Client retries request
 * - Server processes same operation twice
 * - Result: Duplicate expense created, double charge, etc.
 * 
 * Why This Matters for MCP Systems:
 * ---------------------------------
 * - Tool calls have side effects (create expense, delete data, etc.)
 * - LLM might retry failed tool calls
 * - Network issues can cause duplicate requests
 * - Financial operations MUST be idempotent
 * 
 * What Could Go Wrong Without This:
 * ---------------------------------
 * - Duplicate expense entries
 * - Same action executed multiple times
 * - Data inconsistency
 * - User frustration (why did my $500 become $1000?)
 * 
 * MCP Best Practice:
 * ------------------
 * - Generate idempotency key for write operations
 * - Cache results for 24 hours minimum
 * - Return cached result if key seen before
 * - Log when idempotency saves duplicate operation
 */

import crypto from 'crypto';
import { createLogger } from './logger.js';

const logger = createLogger('idempotency');

/**
 * In-memory cache for idempotency
 * In production: Replace with Redis with TTL
 * 
 * Structure:
 * {
 *   'key123': { result: {...}, timestamp: 1234567890, expiresAt: 1234656890 }
 * }
 */
const idempotencyCache = new Map();

/**
 * Default TTL for idempotency keys (24 hours)
 */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Generates an idempotency key for a tool execution
 * 
 * The key is based on:
 * - User ID (different users can have same operation)
 * - Tool name
 * - Normalized arguments
 * 
 * Same user + same tool + same args = same key
 * 
 * @param {number} userId - User ID
 * @param {string} toolName - Tool name
 * @param {Object} args - Tool arguments
 * @returns {string} Idempotency key
 */
export const generateIdempotencyKey = (userId, toolName, args) => {
  // Sort args keys for consistent hashing
  const sortedArgs = Object.keys(args).sort().reduce((obj, key) => {
    obj[key] = args[key];
    return obj;
  }, {});
  
  // Create hash of userId + toolName + args
  const data = JSON.stringify({
    userId,
    toolName,
    args: sortedArgs
  });
  
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return `idem_${hash.substring(0, 32)}`;
};

/**
 * Checks if an operation has already been executed
 * 
 * @param {string} key - Idempotency key
 * @returns {Object|null} Cached result if exists and not expired, null otherwise
 */
export const checkIdempotency = (key) => {
  if (!idempotencyCache.has(key)) {
    return null;
  }
  
  const cached = idempotencyCache.get(key);
  
  // Check if expired
  if (Date.now() > cached.expiresAt) {
    logger.debug('Idempotency key expired', { key });
    idempotencyCache.delete(key);
    return null;
  }
  
  logger.info('Idempotency cache hit - returning cached result', {
    key,
    age: Date.now() - cached.timestamp
  });
  
  return cached.result;
};

/**
 * Stores result of an operation for idempotency
 * 
 * @param {string} key - Idempotency key
 * @param {any} result - Operation result to cache
 * @param {number} ttlMs - Time to live in milliseconds
 */
export const storeIdempotencyResult = (key, result, ttlMs = DEFAULT_TTL_MS) => {
  const now = Date.now();
  
  idempotencyCache.set(key, {
    result,
    timestamp: now,
    expiresAt: now + ttlMs
  });
  
  logger.debug('Stored idempotency result', {
    key,
    ttl: ttlMs,
    expiresAt: new Date(now + ttlMs).toISOString()
  });
  
  // Clean up expired entries periodically
  cleanupExpiredKeys();
};

/**
 * Wraps a tool execution with idempotency protection
 * 
 * Usage:
 *   const result = await withIdempotency(
 *     userId,
 *     'create_expense',
 *     args,
 *     () => createExpense(args)
 *   );
 * 
 * If this exact operation was done recently, returns cached result.
 * Otherwise, executes operation and caches result.
 * 
 * @param {number} userId - User ID
 * @param {string} toolName - Tool name
 * @param {Object} args - Tool arguments
 * @param {Function} executeFn - Function to execute if not cached
 * @param {Object} options - Options
 * @param {number} options.ttl - Cache TTL in milliseconds
 * @param {boolean} options.enabled - Enable/disable idempotency
 * @returns {Promise<any>} Tool result (cached or fresh)
 */
export const withIdempotency = async (userId, toolName, args, executeFn, options = {}) => {
  const {
    ttl = DEFAULT_TTL_MS,
    enabled = true
  } = options;
  
  // Skip idempotency if disabled (useful for read-only operations)
  if (!enabled) {
    return await executeFn();
  }
  
  // Generate idempotency key
  const key = generateIdempotencyKey(userId, toolName, args);
  
  logger.debug('Checking idempotency', { userId, toolName, key });
  
  // Check if already executed
  const cached = checkIdempotency(key);
  if (cached !== null) {
    logger.info('Returning cached result (duplicate operation prevented)', {
      userId,
      toolName,
      key
    });
    return cached;
  }
  
  // Execute operation
  logger.debug('No cached result, executing operation', { userId, toolName, key });
  const result = await executeFn();
  
  // Store result for future duplicate checks
  storeIdempotencyResult(key, result, ttl);
  
  return result;
};

/**
 * Cleans up expired idempotency keys
 * Runs automatically on each store operation
 * In production: Run as cron job if using Redis
 */
const cleanupExpiredKeys = () => {
  // Only run cleanup 1% of the time to avoid overhead
  if (Math.random() > 0.01) {
    return;
  }
  
  const now = Date.now();
  let deletedCount = 0;
  
  for (const [key, cached] of idempotencyCache.entries()) {
    if (now > cached.expiresAt) {
      idempotencyCache.delete(key);
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    logger.debug('Cleaned up expired idempotency keys', { deletedCount });
  }
};

/**
 * Manually invalidates an idempotency key
 * Use when operation needs to be re-executed despite recent execution
 * 
 * @param {string} key - Idempotency key to invalidate
 */
export const invalidateKey = (key) => {
  if (idempotencyCache.has(key)) {
    idempotencyCache.delete(key);
    logger.info('Invalidated idempotency key', { key });
    return true;
  }
  return false;
};

/**
 * Gets statistics about idempotency cache
 * Useful for monitoring and optimization
 */
export const getIdempotencyStats = () => {
  const now = Date.now();
  let activeKeys = 0;
  let expiredKeys = 0;
  
  for (const [key, cached] of idempotencyCache.entries()) {
    if (now <= cached.expiresAt) {
      activeKeys++;
    } else {
      expiredKeys++;
    }
  }
  
  return {
    totalKeys: idempotencyCache.size,
    activeKeys,
    expiredKeys,
    hitRate: 'N/A' // Would need to track hits/misses
  };
};

/**
 * Clears all idempotency data
 * For testing only - DO NOT use in production
 */
export const clearIdempotencyCache = () => {
  idempotencyCache.clear();
  logger.warn('Cleared all idempotency data (testing only)');
};
