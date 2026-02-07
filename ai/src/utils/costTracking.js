/**
 * COST TRACKING AND TOKEN BUDGET MANAGEMENT
 * 
 * Production Problem This Solves:
 * --------------------------------
 * LLM API calls cost money. Without tracking:
 * - No visibility into per-user costs
 * - No way to limit abusive users
 * - Can't identify expensive queries for optimization
 * - Hard to budget for scaling
 * 
 * Why This Matters for MCP Systems:
 * ---------------------------------
 * - Each tool call cycle costs tokens (prompt + tool definitions + response)
 * - RAG queries cost even more (embeddings + retrieval + generation)
 * - Need to track AND limit costs per user tier
 * - Need to identify expensive operations for optimization
 * 
 * What Could Go Wrong Without This:
 * ---------------------------------
 * - Single user could burn through entire API budget
 * - No data to justify pricing tiers
 * - Can't optimize high-cost operations
 * - Surprise bills at month end
 * 
 * MCP Production Best Practice:
 * -----------------------------
 * - Track tokens per tool execution
 * - Track tokens per user per day/month
 * - Enforce budgets based on user tier
 * - Alert when approaching limits
 * - Provide cost visibility to users
 */

import { createLogger } from './logger.js';

const logger = createLogger('cost-tracker');

/**
 * OpenAI Pricing (as of 2026 - update as needed)
 * Prices in USD per 1K tokens
 */
const PRICING = {
  // GPT-4o models
  'gpt-4o': {
    input: 0.005,  // $5 per 1M tokens
    output: 0.015  // $15 per 1M tokens
  },
  'gpt-4o-mini': {
    input: 0.00015,  // $0.15 per 1M tokens
    output: 0.0006   // $0.60 per 1M tokens
  },
  // Embeddings
  'text-embedding-ada-002': {
    input: 0.0001,  // $0.10 per 1M tokens
    output: 0
  },
  'text-embedding-3-small': {
    input: 0.00002,  // $0.02 per 1M tokens
    output: 0
  },
  'text-embedding-3-large': {
    input: 0.00013,  // $0.13 per 1M tokens
    output: 0
  }
};

/**
 * User tier token budgets (tokens per month)
 * In production, store these in database with user records
 */
const TIER_BUDGETS = {
  free: 50000,      // ~50K tokens/month (enough for ~200 requests)
  basic: 200000,    // ~200K tokens/month
  pro: 1000000,     // ~1M tokens/month
  enterprise: Infinity  // No limit
};

/**
 * In-memory token usage tracking
 * In production: Replace with Redis or database
 * 
 * Structure:
 * {
 *   'userId:2026-02': { tokens: 12000, cost: 0.42, requests: 15 }
 * }
 */
const usageCache = new Map();

/**
 * Gets the current month key for usage tracking
 * Format: YYYY-MM
 */
const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Gets usage key for a specific user and month
 */
const getUserMonthKey = (userId, month = getCurrentMonthKey()) => {
  return `${userId}:${month}`;
};

/**
 * Calculates cost for token usage
 * 
 * @param {string} model - Model name
 * @param {number} inputTokens - Input tokens used
 * @param {number} outputTokens - Output tokens used
 * @returns {number} Cost in USD
 */
export const calculateCost = (model, inputTokens, outputTokens) => {
  const pricing = PRICING[model];
  
  if (!pricing) {
    logger.warn('Unknown model for pricing', { model });
    return 0;
  }
  
  // Convert to cost (pricing is per 1K tokens)
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  
  return inputCost + outputCost;
};

/**
 * Records token usage for a user
 * 
 * @param {number} userId - User ID
 * @param {string} model - Model used
 * @param {number} inputTokens - Input tokens
 * @param {number} outputTokens - Output tokens
 * @param {Object} metadata - Additional context (operation, traceId, etc.)
 */
export const recordUsage = (userId, model, inputTokens, outputTokens, metadata = {}) => {
  const month = getCurrentMonthKey();
  const key = getUserMonthKey(userId, month);
  
  const cost = calculateCost(model, inputTokens, outputTokens);
  const totalTokens = inputTokens + outputTokens;
  
  // Get or initialize usage record
  if (!usageCache.has(key)) {
    usageCache.set(key, {
      userId,
      month,
      tokens: 0,
      cost: 0,
      requests: 0,
      byModel: {}
    });
  }
  
  const usage = usageCache.get(key);
  
  // Update totals
  usage.tokens += totalTokens;
  usage.cost += cost;
  usage.requests += 1;
  
  // Track per-model stats
  if (!usage.byModel[model]) {
    usage.byModel[model] = { tokens: 0, cost: 0, requests: 0 };
  }
  usage.byModel[model].tokens += totalTokens;
  usage.byModel[model].cost += cost;
  usage.byModel[model].requests += 1;
  
  logger.info('Recorded token usage', {
    userId,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    cost: cost.toFixed(6),
    monthTotal: usage.tokens,
    monthCost: usage.cost.toFixed(4),
    ...metadata
  });
  
  return usage;
};

/**
 * Gets current token usage for a user
 * 
 * @param {number} userId - User ID
 * @param {string} month - Month key (defaults to current)
 * @returns {Object} Usage statistics
 */
export const getUserUsage = (userId, month = getCurrentMonthKey()) => {
  const key = getUserMonthKey(userId, month);
  return usageCache.get(key) || {
    userId,
    month,
    tokens: 0,
    cost: 0,
    requests: 0,
    byModel: {}
  };
};

/**
 * Checks if user has exceeded their token budget
 * 
 * @param {number} userId - User ID
 * @param {string} userTier - User tier (free, basic, pro, enterprise)
 * @returns {Object} { allowed, remaining, limit }
 */
export const checkTokenBudget = (userId, userTier = 'free') => {
  const usage = getUserUsage(userId);
  const limit = TIER_BUDGETS[userTier] || TIER_BUDGETS.free;
  const remaining = Math.max(0, limit - usage.tokens);
  const allowed = usage.tokens < limit;
  
  if (!allowed) {
    logger.warn('User exceeded token budget', {
      userId,
      tier: userTier,
      used: usage.tokens,
      limit,
      cost: usage.cost.toFixed(4)
    });
  }
  
  return {
    allowed,
    remaining,
    limit,
    used: usage.tokens,
    percentUsed: (usage.tokens / limit) * 100
  };
};

/**
 * Middleware to enforce token budgets
 * Use this in routes to prevent excessive usage
 * 
 * Example:
 *   router.post('/chat', authMiddleware, enforceTokenBudget, async (req, res) => {
 *     // Handle chat
 *   });
 */
export const enforceTokenBudget = (req, res, next) => {
  const userId = req.user?.userId;
  const userTier = req.user?.tier || 'free'; // Get from user record in production
  
  if (!userId) {
    return next(); // Skip if no user (shouldn't happen with authMiddleware)
  }
  
  const budget = checkTokenBudget(userId, userTier);
  
  if (!budget.allowed) {
    logger.warn('Request blocked - token budget exceeded', {
      userId,
      tier: userTier,
      used: budget.used,
      limit: budget.limit
    });
    
    return res.status(429).json({
      error: 'Token budget exceeded',
      message: `You've used ${budget.used} tokens this month (limit: ${budget.limit}). Your budget will reset next month.`,
      details: {
        used: budget.used,
        limit: budget.limit,
        tier: userTier
      }
    });
  }
  
  // Warn user if approaching limit (>80%)
  if (budget.percentUsed > 80) {
    res.set('X-Token-Budget-Warning', 
      `You've used ${budget.percentUsed.toFixed(0)}% of your monthly token budget`
    );
  }
  
  next();
};

/**
 * Gets aggregate usage statistics across all users
 * Useful for cost monitoring and optimization
 * 
 * @returns {Object} Aggregate statistics
 */
export const getAggregateUsage = () => {
  const month = getCurrentMonthKey();
  let totalTokens = 0;
  let totalCost = 0;
  let totalRequests = 0;
  const byModel = {};
  const topUsers = [];
  
  for (const [key, usage] of usageCache.entries()) {
    if (!key.endsWith(month)) continue; // Only current month
    
    totalTokens += usage.tokens;
    totalCost += usage.cost;
    totalRequests += usage.requests;
    
    topUsers.push({
      userId: usage.userId,
      tokens: usage.tokens,
      cost: usage.cost,
      requests: usage.requests
    });
    
    // Aggregate by model
    for (const [model, stats] of Object.entries(usage.byModel)) {
      if (!byModel[model]) {
        byModel[model] = { tokens: 0, cost: 0, requests: 0 };
      }
      byModel[model].tokens += stats.tokens;
      byModel[model].cost += stats.cost;
      byModel[model].requests += stats.requests;
    }
  }
  
  // Sort top users by cost
  topUsers.sort((a, b) => b.cost - a.cost);
  
  return {
    month,
    totalTokens,
    totalCost: totalCost.toFixed(4),
    totalRequests,
    avgTokensPerRequest: totalRequests > 0 ? (totalTokens / totalRequests).toFixed(0) : 0,
    avgCostPerRequest: totalRequests > 0 ? (totalCost / totalRequests).toFixed(6) : 0,
    byModel,
    topUsers: topUsers.slice(0, 10) // Top 10 users
  };
};

/**
 * Clears usage data (for testing or month rollover)
 * In production: Archive old data instead of deleting
 */
export const clearUsageData = () => {
  usageCache.clear();
  logger.info('Cleared all usage data');
};
