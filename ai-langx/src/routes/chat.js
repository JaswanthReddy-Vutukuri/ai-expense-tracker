/**
 * CHAT ROUTES - LangChain Agent Endpoints
 * 
 * PURPOSE:
 * - Main chat endpoint using LangChain agents
 * - Demonstrates LangSmith tracing in Express routes
 * - Same API contract as ai/src/routes/chat.js for compatibility
 * 
 * COMPARE WITH: ai/src/routes/chat.js
 * 
 * KEY DIFFERENCES:
 * - Uses executeExpenseAgent() instead of processChatMessage()
 * - Automatic LangSmith tracing (no manual logging)
 * - Same request/response format for frontend compatibility
 */

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { executeExpenseAgent } from '../agents/expense.agent.js';
import { handleRAGQuestion } from '../handlers/rag.handler.js';
import { executeIntentRouter } from '../graphs/intent-router.graph.js';
import { generateTraceId } from '../utils/helpers.js';

const router = express.Router();

/**
 * POST /ai/chat - Main chat endpoint
 * 
 * LANGCHAIN INTEGRATION:
 * - Uses LangChain agent executor
 * - Automatic LangSmith tracing
 * - Same safety limits as custom implementation
 * 
 * REQUEST:
 * ```json
 * {
 *   "message": "Add 500 for lunch today",
 *   "history": []  // optional conversation history
 * }
 * ```
 * 
 * RESPONSE:
 * ```json
 * {
 *   "reply": "✅ Successfully added ₹500 for Food on 2026-02-08"
 * }
 * ```
 */
router.post('/chat', authMiddleware, async (req, res, next) => {
  const traceId = generateTraceId();
  const userId = req.user?.userId || null;
  
  try {
    const { message, history } = req.body;
    
    // Input validation
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'A valid string "message" property is required.' 
      });
    }
    
    const MAX_MESSAGE_LENGTH = 10000;
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`
      });
    }
    
    if (message.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message cannot be empty'
      });
    }
    
    if (history && !Array.isArray(history)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'History must be an array'
      });
    }
    
    console.log('[Chat Route] Processing:', {
      userId,
      traceId,
      messageLength: message.length,
      historyLength: history?.length || 0,
      messagePreview: message.substring(0, 100)
    });
    
    // USE LANGGRAPH INTENT ROUTER
    // This replaces the simple keyword detection with LLM-based classification
    // and automatic routing through a state graph
    
    try {
      console.log('[Chat Route] Using LangGraph intent router');
      
      const authToken = req.headers.authorization?.replace('Bearer ', '');
      
      // Execute intent router graph
      const graphResult = await executeIntentRouter(
        message,
        userId,
        authToken,
        history || []
      );
      
      console.log('[Chat Route] Graph execution complete:', {
        intent: graphResult.intent,
        confidence: graphResult.confidence,
        hasError: !!graphResult.error
      });
      
      // Return result
      const reply = graphResult.result || graphResult.error || "I couldn't process your request.";
      
      return res.json({ 
        reply,
        metadata: {
          intent: graphResult.intent,
          confidence: graphResult.confidence,
          reasoning: graphResult.reasoning
        }
      });
      
    } catch (error) {
      console.error('[Chat Route] Intent router error:', error.message);
      // Fall back to direct agent execution
      console.log('[Chat Route] Falling back to direct agent');
    }
    
    // FALLBACK: Execute LangChain agent directly for expense operations
    // All tool calls, LLM calls, and errors are automatically traced in LangSmith
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    
    const reply = await executeExpenseAgent(
      message,
      authToken,
      history || [],
      { userId, traceId }
    );
    
    console.log('[Chat Route] Success:', {
      userId,
      traceId,
      replyLength: reply.length
    });
    
    // Return response in same format as custom implementation
    res.json({ reply });
    
  } catch (error) {
    console.error('[Chat Route] Error:', {
      userId,
      traceId,
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Return detailed error message for debugging
    const errorDetails = {
      reply: `⚠️ Sorry, I encountered an error: ${error.message}. Please try again.`,
      error: {
        message: error.message,
        type: error.name,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      },
      traceId
    };
    
    return res.status(500).json(errorDetails);
  }
});

/**
 * GET /ai/chat/info - Endpoint information
 * Useful for debugging and documentation
 */
router.get('/chat/info', (req, res) => {
  res.json({
    endpoint: '/ai/chat',
    method: 'POST',
    description: 'Chat with AI assistant for expense management',
    framework: 'LangChain + LangGraph',
    observability: 'LangSmith',
    authentication: 'JWT Bearer token required',
    request_format: {
      message: 'string (required)',
      history: 'array of {role, content} objects (optional)'
    },
    response_format: {
      reply: 'string'
    },
    examples: [
      {
        request: { message: 'Add 500 for lunch today' },
        response: { reply: '✅ Successfully added ₹500 for Food on 2026-02-08' }
      },
      {
        request: { message: 'Show my expenses' },
        response: { reply: 'You have 3 expenses totaling ₹1,500...' }
      }
    ],
    comparison: {
      custom_implementation: 'http://localhost:3001/ai/chat',
      langchain_implementation: 'http://localhost:3002/ai/chat',
      note: 'Both implementations have identical API contracts'
    }
  });
});

export default router;

/**
 * LEARNING NOTE - LANGSMITH AUTOMATIC TRACING:
 * 
 * When LANGCHAIN_TRACING_V2=true, every request through this route
 * automatically creates a trace in LangSmith showing:
 * 
 * 1. Agent initialization
 * 2. LLM calls (with prompts and responses)
 * 3. Tool calls (with arguments and results)
 * 4. Intermediate reasoning steps
 * 5. Final output
 * 6. Total tokens and cost
 * 7. Execution time per step
 * 
 * NO MANUAL LOGGING NEEDED!
 * 
 * Compare with custom implementation (ai/src/routes/chat.js) which requires:
 * - Manual logger.info() calls
 * - Custom trace ID propagation
 * - Manual cost tracking
 * - Custom structured logging
 * 
 * TRADE-OFF:
 * ✅ LangSmith: Automatic, visual, rich data
 * ✅ Custom: Full control, no external dependency
 * 
 * Both are valid production approaches!
 */
