import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { routeRequest } from '../router/intentRouter.js';
import { handleTransactional } from '../handlers/transactionalHandler.js';
import { handleRagQA } from '../handlers/ragQaHandler.js';
import { handleRagCompare } from '../handlers/ragCompareHandler.js';
import { handleClarification } from '../handlers/clarificationHandler.js';
import { handleSyncReconcile } from '../handlers/syncReconcileHandler.js';

const router = express.Router();

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
 */
router.post('/chat', authMiddleware, async (req, res, next) => {
  try {
    const { message, history } = req.body;

    // AUDIT FIX: Part 10 - Input Validation
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'A valid string "message" property is required in the request body.' 
      });
    }
    
    // AUDIT FIX: Enforce maximum message length to prevent DOS attacks
    const MAX_MESSAGE_LENGTH = 10000;
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Message too long (max ${MAX_MESSAGE_LENGTH} characters, got ${message.length})`
      });
    }
    
    // Enforce minimum message length
    if (message.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message cannot be empty'
      });
    }
    
    // Validate history format if provided
    if (history && !Array.isArray(history)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'History must be an array of message objects'
      });
    }

    console.log(`[Chat Route] User ${req.user.userId} processing message: "${message.substring(0, 100)}..."`);

    // Step 1: Classify intent
    const intent = await routeRequest(message);
    console.log(`[Chat Route] Routed to intent: ${intent}`);

    // Step 2: Route to appropriate handler
    // AUDIT FIX: Pass userId to RAG handlers for user isolation
    let reply;
    
    switch (intent) {
      case 'TRANSACTIONAL':
        reply = await handleTransactional(message, req.token, history);
        break;
      
      case 'RAG_QA':
        // AUDIT FIX: Pass userId for user-scoped document search
        reply = await handleRagQA(message, req.token, req.user.userId);
        break;
      
      case 'RAG_COMPARE':
        // AUDIT FIX: Pass userId for user-scoped comparison
        reply = await handleRagCompare(message, req.token, req.user.userId);
        break;
      
      case 'SYNC_RECONCILE':
        // ENTERPRISE RECONCILIATION: Multi-stage pipeline
        // Compare → Plan → Sync → Report
        // All deterministic, fully logged, no LLM decisions
        reply = await handleSyncReconcile(message, req.token, req.user.userId);
        break;
      
      case 'CLARIFICATION':
        reply = await handleClarification(message);
        break;
      
      default:
        // Fallback to transactional
        console.warn(`[Chat Route] Unknown intent "${intent}", defaulting to TRANSACTIONAL`);
        reply = await handleTransactional(message, req.token);
    }
    
    res.json({ reply, intent });
  } catch (error) {
    // Pass to centralized error handler middleware
    next(error);
  }
});

export default router;
