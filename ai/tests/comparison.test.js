/**
 * EXPENSE COMPARISON TESTS
 * 
 * Test Coverage
 * Tests deterministic expense comparison logic (Jaccard similarity, matching)
 */

import { compareExpenses, descriptionSimilarity } from '../src/comparison/expenseComparator.js';

describe('Expense Comparison - Description Similarity', () => {
  test('calculates high similarity for identical descriptions', () => {
    const sim = descriptionSimilarity('Coffee Shop', 'Coffee Shop');
    expect(sim).toBe(1.0);
  });

  test('calculates high similarity for similar descriptions', () => {
    const sim = descriptionSimilarity('Coffee Shop Downtown', 'Coffee Shop');
    expect(sim).toBeGreaterThan(0.6);
  });

  test('calculates low similarity for different descriptions', () => {
    const sim = descriptionSimilarity('Coffee', 'Groceries');
    expect(sim).toBeLessThan(0.2);
  });

  test('is case-insensitive', () => {
    const sim = descriptionSimilarity('COFFEE SHOP', 'coffee shop');
    expect(sim).toBe(1.0);
  });

  test('handles empty descriptions', () => {
    const sim = descriptionSimilarity('', 'Coffee');
    expect(sim).toBe(0);
  });
});

describe('Expense Comparison - Matching Logic', () => {
  test('matches identical expenses', () => {
    const pdfExpenses = [
      { amount: 100, description: 'Coffee Shop', date: '2026-02-01' }
    ];
    const appExpenses = [
      { amount: 100, category_name: 'Food', description: 'Coffee Shop', date: '2026-02-01' }
    ];
    
    const result = compareExpenses(pdfExpenses, appExpenses);
    
    expect(result.matched).toHaveLength(1);
    expect(result.pdfOnly).toHaveLength(0);
    expect(result.appOnly).toHaveLength(0);
  });

  test('detects PDF-only expenses', () => {
    const pdfExpenses = [
      { amount: 100, description: 'Coffee', date: '2026-02-01' }
    ];
    const appExpenses = [];
    
    const result = compareExpenses(pdfExpenses, appExpenses);
    
    expect(result.matched).toHaveLength(0);
    expect(result.pdfOnly).toHaveLength(1);
    expect(result.appOnly).toHaveLength(0);
  });

  test('detects app-only expenses', () => {
    const pdfExpenses = [];
    const appExpenses = [
      { amount: 100, category_name: 'Food', date: '2026-02-01' }
    ];
    
    const result = compareExpenses(pdfExpenses, appExpenses);
    
    expect(result.matched).toHaveLength(0);
    expect(result.pdfOnly).toHaveLength(0);
    expect(result.appOnly).toHaveLength(1);
  });

  test('handles date mismatches', () => {
    const pdfExpenses = [
      { amount: 100, description: 'Coffee', date: '2026-02-01' }
    ];
    const appExpenses = [
      { amount: 100, category_name: 'Food', description: 'Coffee', date: '2026-02-02' }
    ];
    
    const result = compareExpenses(pdfExpenses, appExpenses);
    
    // With requireSameDate=true (default), these should NOT match
    expect(result.matched).toHaveLength(0);
    expect(result.pdfOnly).toHaveLength(1);
    expect(result.appOnly).toHaveLength(1);
  });

  test('respects amount tolerance', () => {
    const pdfExpenses = [
      { amount: 100.00, description: 'Coffee', date: '2026-02-01' }
    ];
    const appExpenses = [
      { amount: 100.01, category_name: 'Food', description: 'Coffee', date: '2026-02-01' }
    ];
    
    // Default tolerance is 0.01, so this should match
    const result = compareExpenses(pdfExpenses, appExpenses);
    
    expect(result.matched).toHaveLength(1);
  });

  test('generates summary statistics', () => {
    const pdfExpenses = [
      { amount: 100, description: 'Coffee', date: '2026-02-01' },
      { amount: 200, description: 'Lunch', date: '2026-02-01' }
    ];
    const appExpenses = [
      { amount: 100, category_name: 'Food', description: 'Coffee', date: '2026-02-01' }
    ];
    
    const result = compareExpenses(pdfExpenses, appExpenses);
    
    expect(result.summary).toHaveProperty('pdfTotal');
    expect(result.summary.pdfTotal.count).toBe(2);
    expect(result.summary.pdfTotal.amount).toBe(300);
    expect(result.summary.appTotal.count).toBe(1);
    expect(result.summary.appTotal.amount).toBe(100);
  });
});
