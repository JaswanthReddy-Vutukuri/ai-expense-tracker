import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { routeRequest } from '../router/intentRouter.js';
import { handleTransactional } from '../handlers/transactionalHandler.js';
import { handleRagQA } from '../handlers/ragQaHandler.js';
import { handleRagCompare } from '../handlers/ragCompareHandler.js';
import { handleClarification } from '../handlers/clarificationHandler.js';
import { handleSyncReconcile } from '../handlers/syncReconcileHandler.js';
import { createLogger, generateTraceId } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger('chat-route');

/**
 * Primary Chat Endpoint
 * URL: POST /ai/chat
 * Body: { "message": "Add 500 for lunch today" }
 * Secure: Requires Authorization Header with JWT
 * 
 * Architecture:
 * 1. Classify intent (TRANSACTIONAL, RAG_QA, RAG_COMPARE, CLARIFICATION)
 * 2. Route to appropriate handler
 * 3. Return natural language response
 * 
 * Production Hardening:
 * --------------------
 * - Trace ID generation for request correlation
 * - Input validation (length limits, type checks)
 * - User context propagation (userId, traceId)
 * - Structured logging for observability
 */
router.post('/chat', authMiddleware, async (req, res, next) => {
  // PRODUCTION: Generate trace ID for request correlation
  const traceId = generateTraceId();
  const userId = req.user?.userId || null;
  
  // Create request-scoped logger
  const requestLogger = logger.child({ traceId, userId });
  
  try {
    const { message, history } = req.body;

    // Input Validation
    if (!message || typeof message !== 'string') {
      requestLogger.warn('Invalid message format', { providedType: typeof message });
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'A valid string "message" property is required in the request body.' 
      });
    }
    
    // Enforce maximum message length to prevent DOS attacks
    const MAX_MESSAGE_LENGTH = 10000;
    if (message.length > MAX_MESSAGE_LENGTH) {
      requestLogger.warn('Message too long', { length: message.length, max: MAX_MESSAGE_LENGTH });
      return res.status(400).json({
        error: 'Bad Request',
        message: `Message too long (max ${MAX_MESSAGE_LENGTH} characters, got ${message.length})`
      });
    }
    
    // Enforce minimum message length
    if (message.trim().length === 0) {
      requestLogger.warn('Empty message received');
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message cannot be empty'
      });
    }
    
    // Validate history format if provided
    if (history && !Array.isArray(history)) {
      requestLogger.warn('Invalid history format', { providedType: typeof history });
      return res.status(400).json({
        error: 'Bad Request',
        message: 'History must be an array of message objects'
      });
    }

    requestLogger.info('Processing chat message', {
      messageLength: message.length,
      historyLength: history?.length || 0,
      messagePreview: message.substring(0, 100)
    });

    // Step 1: Classify intent
    const intent = await routeRequest(message);
    requestLogger.info('Intent classified', { intent });

    // PRODUCTION: Create context object for handlers
    const context = { traceId, userId };

    // Step 2: Route to appropriate handler with context
    let reply;
    
    switch (intent) {
      case 'TRANSACTIONAL':
        reply = await handleTransactional(message, req.token, history, context);
        break;
      
      case 'RAG_QA':
        // User-scoped document search with context
        reply = await handleRagQA(message, req.token, userId, context);
        break;
      
      case 'RAG_COMPARE':
        // User-scoped comparison with context
        reply = await handleRagCompare(message, req.token, userId, context);
        break;
      
      case 'SYNC_RECONCILE':
        // Enterprise reconciliation with full context
        reply = await handleSyncReconcile(message, req.token, userId, context);
        break;
      
      case 'CLARIFICATION':
        reply = await handleClarification(message, context);
        break;
      
      default:
        // Fallback to transactional
        requestLogger.warn('Unknown intent, defaulting to TRANSACTIONAL', { intent });
        reply = await handleTransactional(message, req.token, history, context);
    }
    
    res.json({ reply, intent });
  } catch (error) {
    // Pass to centralized error handler middleware
    next(error);
  }
});

export default router;
