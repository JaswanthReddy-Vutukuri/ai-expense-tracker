/**
 * EXPENSE VALIDATOR TESTS
 * 
 * Test Coverage
 * Tests deterministic business logic validation
 * Ensures category normalization, date parsing, and amount validation work correctly
 */

import {
  normalizeCategory,
  parseDate,
  validateAmount,
  validateDescription,
  validateExpense
} from '../src/validators/expenseValidator.js';

describe('Expense Validator - Category Normalization', () => {
  test('normalizes food-related categories', () => {
    expect(normalizeCategory('food')).toBe('Food & Dining');
    expect(normalizeCategory('restaurant')).toBe('Food & Dining');
    expect(normalizeCategory('lunch')).toBe('Food & Dining');
    expect(normalizeCategory('coffee')).toBe('Food & Dining');
  });

  test('normalizes transport categories', () => {
    expect(normalizeCategory('uber')).toBe('Transportation');
    expect(normalizeCategory('taxi')).toBe('Transportation');
    expect(normalizeCategory('gas')).toBe('Transportation');
    expect(normalizeCategory('fuel')).toBe('Transportation');
  });

  test('is case-insensitive', () => {
    expect(normalizeCategory('FOOD')).toBe('Food & Dining');
    expect(normalizeCategory('Food')).toBe('Food & Dining');
    expect(normalizeCategory('FoOd')).toBe('Food & Dining');
  });

  test('defaults to Other for unknown categories', () => {
    expect(normalizeCategory('xyz123')).toBe('Other');
    expect(normalizeCategory('unknown')).toBe('Other');
  });

  test('handles empty input', () => {
    expect(normalizeCategory('')).toBe('Other');
    expect(normalizeCategory(null)).toBe('Other');
  });
});

describe('Expense Validator - Date Parsing', () => {
  const referenceDate = new Date('2026-02-01T10:00:00Z');

  test('parses "today" relative to reference date', () => {
    expect(parseDate('today', referenceDate)).toBe('2026-02-01');
  });

  test('parses "yesterday" relative to reference date', () => {
    expect(parseDate('yesterday', referenceDate)).toBe('2026-01-31');
  });

  test('accepts ISO format (YYYY-MM-DD)', () => {
    expect(parseDate('2026-02-15')).toBe('2026-02-15');
    expect(parseDate('2025-12-25')).toBe('2025-12-25');
  });

  test('accepts DD/MM/YYYY format', () => {
    expect(parseDate('15/02/2026')).toBe('2026-02-15');
    expect(parseDate('01/01/2026')).toBe('2026-01-01');
  });

  test('rejects invalid date formats', () => {
    expect(() => parseDate('invalid')).toThrow('Invalid date format');
    expect(() => parseDate('2026-13-01')).toThrow(); // Invalid month
    expect(() => parseDate('abc/def/2026')).toThrow();
  });

  test('requires date input', () => {
    expect(() => parseDate('')).toThrow('Date is required');
    expect(() => parseDate(null)).toThrow('Date is required');
  });
});

describe('Expense Validator - Amount Validation', () => {
  test('validates positive numbers', () => {
    expect(validateAmount(100)).toBe(100);
    expect(validateAmount(50.5)).toBe(50.5);
    expect(validateAmount(0.01)).toBe(0.01);
  });

  test('rounds to 2 decimal places', () => {
    expect(validateAmount(100.999)).toBe(101);
    expect(validateAmount(50.555)).toBe(50.56);
  });

  test('accepts string numbers', () => {
    expect(validateAmount('100')).toBe(100);
    expect(validateAmount('50.50')).toBe(50.5);
  });

  test('rejects negative amounts', () => {
    expect(() => validateAmount(-100)).toThrow('Amount must be positive');
    expect(() => validateAmount(-0.01)).toThrow('Amount must be positive');
  });

  test('rejects zero', () => {
    expect(() => validateAmount(0)).toThrow('Amount must be positive');
  });

  test('rejects non-numeric values', () => {
    expect(() => validateAmount('abc')).toThrow('must be a valid number');
    expect(() => validateAmount(NaN)).toThrow('must be a valid number');
  });

  test('rejects infinite values', () => {
    expect(() => validateAmount(Infinity)).toThrow('must be a finite number');
    expect(() => validateAmount(-Infinity)).toThrow('must be a finite number');
  });

  test('rejects unreasonably large amounts', () => {
    expect(() => validateAmount(99999999)).toThrow('exceeds maximum');
  });
});

describe('Expense Validator - Description Validation', () => {
  test('validates non-empty strings', () => {
    expect(validateDescription('Coffee at Starbucks')).toBe('Coffee at Starbucks');
    expect(validateDescription('Lunch')).toBe('Lunch');
  });

  test('trims whitespace', () => {
    expect(validateDescription('  Coffee  ')).toBe('Coffee');
    expect(validateDescription('\\n  Lunch  \\t')).toBe('Lunch');
  });

  test('rejects empty strings', () => {
    expect(() => validateDescription('')).toThrow('Description cannot be empty');
    expect(() => validateDescription('   ')).toThrow('Description cannot be empty');
  });

  test('rejects non-strings', () => {
    expect(() => validateDescription(null)).toThrow('must be a string');
    expect(() => validateDescription(123)).toThrow('must be a string');
  });

  test('rejects excessively long descriptions', () => {
    const longDesc = 'a'.repeat(300);
    expect(() => validateDescription(longDesc)).toThrow('Description too long');
  });
});

describe('Expense Validator - Full Expense Validation', () => {
  test('validates complete expense object', () => {
    const result = validateExpense({
      amount: 150.50,
      description: 'Team lunch',
      category: 'food',
      date: '2026-02-01'
    });

    expect(result).toEqual({
      amount: 150.5,
      description: 'Team lunch',
      category: 'Food & Dining',
      date: '2026-02-01'
    });
  });

  test('throws descriptive error for invalid fields', () => {
    expect(() => validateExpense({
      amount: -50,
      description: 'Test',
      category: 'food',
      date: 'today'
    })).toThrow('Expense validation failed');
  });
});
