/**
 * RECONCILIATION ROUTE - Bank Statement Reconciliation
 * 
 * PURPOSE:
 * - Accept bank statement data
 * - Run reconciliation graph
 * - Return matches and discrepancies
 * 
 * ROUTE: POST /ai/reconcile
 */

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { executeReconciliation } from '../graphs/reconciliation.graph.js';

const router = express.Router();

/**
 * POST /ai/reconcile - Reconcile bank statement
 * 
 * REQUEST:
 * ```json
 * {
 *   "bankStatement": [
 *     {
 *       "date": "2026-02-01",
 *       "description": "Restaurant XYZ",
 *       "amount": 500,
 *       "category": "Food"
 *     }
 *   ],
 *   "autoSync": false
 * }
 * ```
 * 
 * RESPONSE:
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "summary": "...",
 *     "statistics": {...},
 *     "matches": [...],
 *     "discrepancies": [...],
 *     "suggestedActions": [...]
 *   }
 * }
 * ```
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { bankStatement, autoSync } = req.body;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    if (!bankStatement || !Array.isArray(bankStatement) || bankStatement.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Bank statement data is required (array of transactions)'
      });
    }
    
    console.log('[Reconciliation Route] Starting reconciliation');
    console.log('[Reconciliation Route] User:', userId);
    console.log('[Reconciliation Route] Transactions:', bankStatement.length);
    console.log('[Reconciliation Route] Auto-sync:', autoSync);
    
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    
    // Execute reconciliation graph
    const result = await executeReconciliation(
      bankStatement,
      userId,
      authToken,
      { autoSync: autoSync || false }
    );
    
    console.log('[Reconciliation Route] Complete');
    
    return res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('[Reconciliation Route] Error:', error.message);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to reconcile bank statement',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /ai/reconcile/info - Endpoint information
 */
router.get('/info', (req, res) => {
  res.json({
    endpoint: '/ai/reconcile',
    method: 'POST',
    description: 'Reconcile bank statement with tracked expenses',
    framework: 'LangGraph multi-step workflow',
    authentication: 'JWT Bearer token required',
    workflow: [
      '1. Fetch app expenses',
      '2. Fetch PDF receipts (optional)',
      '3. Compare bank vs app',
      '4. Compare bank vs PDFs',
      '5. Analyze discrepancies',
      '6. Auto-sync (optional)',
      '7. Generate report'
    ],
    request_format: {
      bankStatement: 'array of {date, description, amount, category?}',
      autoSync: 'boolean (optional, default: false)'
    },
    response_format: {
      success: 'boolean',
      data: {
        summary: 'string (LLM analysis)',
        statistics: 'object (counts and rates)',
        matches: 'array (matched transactions)',
        discrepancies: 'array (mismatches)',
        suggestedActions: 'array (recommended fixes)'
      }
    },
    example: {
      request: {
        bankStatement: [
          {
            date: '2026-02-01',
            description: 'Restaurant XYZ',
            amount: 500,
            category: 'Food'
          }
        ],
        autoSync: false
      }
    }
  });
});

export default router;
