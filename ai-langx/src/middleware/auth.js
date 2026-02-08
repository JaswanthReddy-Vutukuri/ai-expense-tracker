/**
 * AUTHENTICATION MIDDLEWARE
 * 
 * PURPOSE:
 * - JWT token validation
 * - User context extraction
 * - Same implementation as ai/src/middleware/auth.js
 * 
 * NOTE: This is reused from custom implementation
 * Authentication logic is independent of LangChain/LangGraph
 */

import jwt from 'jsonwebtoken';

/**
 * Express middleware to validate JWT token
 * 
 * Behavior:
 * - If JWT_SECRET is configured: validate token strictly
 * - If JWT_SECRET is NOT configured: allow through (backward compatibility)
 * 
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'No valid authorization token provided in Bearer format.' 
    });
  }

  // Extract the raw token
  const token = authHeader.split(' ')[1];
  req.token = token;
  
  // Decode and verify JWT to extract userId (if JWT_SECRET is configured)
  if (process.env.JWT_SECRET) {
    try {
      // Decode JWT to extract userId for RAG filtering (critical for multi-tenancy)
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Populate req.user for RAG filtering
      req.user = {
        userId: decoded.id || decoded.userId,
        email: decoded.email // optional, for logging
      };
      
      console.log(`[Auth] Authenticated user: ${decoded.id || decoded.userId}`);
      next();
    } catch (error) {
      // Token validation failed (expired, invalid signature, malformed)
      console.error('[Auth] Token verification failed:', error.message);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired authentication token'
      });
    }
  } else {
    // JWT_SECRET not configured - skip user extraction
    // WARNING: User isolation will not work without JWT_SECRET
    console.warn('[Auth] JWT_SECRET not configured - user isolation disabled. Set JWT_SECRET in .env to enable user-scoped RAG operations.');
    
    // For backward compatibility, still forward the token to backend
    // Backend will validate the token for API calls
    req.user = { userId: null }; // Set to null to avoid errors in RAG handlers
    next();
  }
};
