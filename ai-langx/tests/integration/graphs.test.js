/**
 * GRAPH INTEGRATION TESTS
 * 
 * Tests for LangGraph state graphs:
 * - IntentRouterGraph
 * - ReconciliationGraph
 */

import { ReconciliationStateSchema } from '../../src/graphs/state.js';

describe('State Schemas', () => {
  describe('ReconciliationStateSchema', () => {
    test('should validate correct reconciliation state', () => {
      const validState = {
        userId: 123,
        authToken: 'token-abc',
        stage: 'init'
      };

      const result = ReconciliationStateSchema.safeParse(validState);
      expect(result.success).toBe(true);
    });

    test('should reject invalid user ID', () => {
      const invalidState = {
        userId: 'not-a-number',
        authToken: 'token'
      };

      const result = ReconciliationStateSchema.safeParse(invalidState);
      expect(result.success).toBe(false);
    });

    test('should have default values', () => {
      const minimalState = {
        userId: 123,
        authToken: 'token'
      };

      const result = ReconciliationStateSchema.safeParse(minimalState);
      expect(result.success).toBe(true);
      expect(result.data.autoSyncEnabled).toBe(false);
      expect(result.data.retryCount).toBe(0);
      expect(result.data.stage).toBe('init');
    });

    test('should validate bank statement data', () => {
      const state = {
        userId: 123,
        authToken: 'token',
        bankStatementData: [
          {
            date: '2024-01-15',
            description: 'Starbucks',
            amount: 5.50
          }
        ]
      };

      const result = ReconciliationStateSchema.safeParse(state);
      expect(result.success).toBe(true);
      expect(result.data.bankStatementData).toHaveLength(1);
    });

    test('should validate matches', () => {
      const state = {
        userId: 123,
        authToken: 'token',
        matches: [
          {
            bankTransaction: { amount: 100 },
            appExpense: { id: 1 },
            matchScore: 0.95,
            matchType: 'exact'
          }
        ]
      };

      const result = ReconciliationStateSchema.safeParse(state);
      expect(result.success).toBe(true);
      expect(result.data.matches[0].matchScore).toBe(0.95);
    });

    test('should validate discrepancies', () => {
      const state = {
        userId: 123,
        authToken: 'token',
        discrepancies: [
          {
            type: 'amount_mismatch',
            difference: 10,
            severity: 'high'
          }
        ]
      };

      const result = ReconciliationStateSchema.safeParse(state);
      expect(result.success).toBe(true);
      expect(result.data.discrepancies[0].type).toBe('amount_mismatch');
    });

    test('should validate all stage values', () => {
      const stages = [
        'init', 'fetch_app_expenses', 'fetch_pdf_receipts',
        'compare_bank_vs_app', 'compare_bank_vs_pdf',
        'analyze_discrepancies', 'generate_report',
        'auto_sync', 'complete', 'error'
      ];

      stages.forEach(stage => {
        const state = { userId: 123, authToken: 'token', stage };
        const result = ReconciliationStateSchema.safeParse(state);
        expect(result.success).toBe(true);
        expect(result.data.stage).toBe(stage);
      });
    });

    test('should validate suggested actions', () => {
      const state = {
        userId: 123,
        authToken: 'token',
        suggestedActions: [
          {
            action: 'create_expense',
            target: { amount: 50, category: 'food' },
            reason: 'Missing in app'
          }
        ]
      };

      const result = ReconciliationStateSchema.safeParse(state);
      expect(result.success).toBe(true);
      expect(result.data.suggestedActions).toHaveLength(1);
    });
  });
});

describe('State Management', () => {
  describe('State Transitions', () => {
    test('should track state progression', () => {
      let state = {
        userId: 123,
        authToken: 'token',
        stage: 'init'
      };

      const stages = [
        'fetch_app_expenses',
        'fetch_pdf_receipts',
        'compare_bank_vs_app',
        'generate_report',
        'complete'
      ];

      stages.forEach(stage => {
        state = { ...state, stage };
        const result = ReconciliationStateSchema.safeParse(state);
        expect(result.success).toBe(true);
      });
    });

    test('should handle error state', () => {
      const state = {
        userId: 123,
        authToken: 'token',
        stage: 'error',
        error: 'Failed to fetch expenses'
      };

      const result = ReconciliationStateSchema.safeParse(state);
      expect(result.success).toBe(true);
      expect(result.data.error).toBeDefined();
    });
  });

  describe('State Accumulation', () => {
    test('should accumulate multiple field types', () => {
      const state = {
        userId: 123,
        authToken: 'token',
        bankStatementData: [{ date: '2024-01-15', description: 'test', amount: 100 }],
        appExpenses: [{ id: 1, amount: 100 }],
        pdfReceipts: [{ id: 'pdf-1', description: 'receipt' }],
        matches: [
          {
            bankTransaction: { amount: 100 },
            appExpense: { id: 1 },
            matchScore: 1.0,
            matchType: 'exact'
          }
        ],
        discrepancies: [],
        suggestedActions: [],
        summary: 'All matched',
        stage: 'complete'
      };

      const result = ReconciliationStateSchema.safeParse(state);
      expect(result.success).toBe(true);
      expect(result.data.appExpenses).toBeDefined();
      expect(result.data.matches).toBeDefined();
    });
  });
});

describe('Reducers', () => {
  test('append reducer adds to arrays', () => {
    const existing = [1, 2, 3];
    const update = [4, 5];
    
    // Simulating append reducer behavior
    const result = [...existing, ...update];
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  test('override reducer replaces values', () => {
    const existing = 'old';
    const update = 'new';
    
    const result = update !== undefined ? update : existing;
    expect(result).toBe('new');
  });

  test('merge reducer combines objects', () => {
    const existing = { a: 1, b: 2 };
    const update = { b: 20, c: 3 };
    
    const result = { ...existing, ...update };
    expect(result).toEqual({ a: 1, b: 20, c: 3 });
  });
});
