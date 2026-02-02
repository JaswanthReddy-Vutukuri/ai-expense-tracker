/**
 * EXPENSE VALIDATOR MODULE
 * 
 * AUDIT FIX: Part 3 - Business Logic Extraction from LLM Prompts
 * 
 * Purpose:
 * - Provides deterministic validation and normalization of expense data
 * - Moves business logic OUT of LLM prompts INTO code
 * - Ensures consistent, predictable expense creation
 * 
 * Why this exists:
 * - LLM-based category mapping is non-deterministic (same input → different outputs)
 * - LLM-based date parsing is unreliable (natural language → errors)
 * - Amount validation in prompts is not enforceable
 * 
 * Architecture fit:
 * - Used by MCP tools (createExpense, modifyExpense) BEFORE backend API calls
 * - Pure functions - no side effects, testable
 * - Returns validated/normalized data or throws descriptive errors
 * 
 * Audit reference: PRINCIPAL_ENGINEER_AUDIT.md Part 3 - "Business Logic in LLM Prompt - CRITICAL CONCERN"
 */

/**
 * Deterministic category normalization with exhaustive mapping
 * 
 * AUDIT FIX: Replaces LLM-based category mapping in systemPrompt.js
 * This ensures "food" ALWAYS maps to "Food & Dining", not sometimes "Food", sometimes "Dining"
 * 
 * @param {string} input - Raw category from LLM or user
 * @returns {string} Normalized category name
 */
export const normalizeCategory = (input) => {
  if (!input) {
    return 'Other';
  }

  // Convert to lowercase for case-insensitive matching
  const normalized = input.toLowerCase().trim();
  
  // Exhaustive category mapping (deterministic)
  // AUDIT REQUIREMENT: All category logic must be in code, not LLM prompt
  // Maps to backend categories: Food, Transport, Entertainment, Shopping, Bills, Health, Other
  const categoryMap = {
    // Food
    'food': 'Food',
    'dining': 'Food',
    'restaurant': 'Food',
    'lunch': 'Food',
    'dinner': 'Food',
    'breakfast': 'Food',
    'coffee': 'Food',
    'cafe': 'Food',
    'snacks': 'Food',
    'meal': 'Food',
    'meals': 'Food',
    'grocery': 'Food',
    'groceries': 'Food',
    'supermarket': 'Food',
    'vegetables': 'Food',
    'fruits': 'Food',
    
    // Transport
    'transport': 'Transport',
    'transportation': 'Transport',
    'uber': 'Transport',
    'taxi': 'Transport',
    'cab': 'Transport',
    'gas': 'Transport',
    'fuel': 'Transport',
    'petrol': 'Transport',
    'metro': 'Transport',
    'bus': 'Transport',
    'train': 'Transport',
    'travel': 'Transport',
    'commute': 'Transport',
    
    // Entertainment
    'entertainment': 'Entertainment',
    'movie': 'Entertainment',
    'cinema': 'Entertainment',
    'concert': 'Entertainment',
    'game': 'Entertainment',
    'gaming': 'Entertainment',
    'spotify': 'Entertainment',
    'netflix': 'Entertainment',
    
    // Shopping
    'shopping': 'Shopping',
    'clothes': 'Shopping',
    'clothing': 'Shopping',
    'shoes': 'Shopping',
    'accessories': 'Shopping',
    'electronics': 'Shopping',
    'gadgets': 'Shopping',
    
    // Health
    'health': 'Health',
    'healthcare': 'Health',
    'medical': 'Health',
    'medicine': 'Health',
    'pharmacy': 'Health',
    'doctor': 'Health',
    'hospital': 'Health',
    'dental': 'Health',
    
    // Bills
    'bills': 'Bills',
    'bill': 'Bills',
    'utilities': 'Bills',
    'utility': 'Bills',
    'electricity': 'Bills',
    'water': 'Bills',
    'internet': 'Bills',
    'phone': 'Bills',
    'mobile': 'Bills',
    'rent': 'Bills',
    'mortgage': 'Bills',
    'maintenance': 'Bills',
    
    // Education -> Other (backend doesn't have Education category)
    'education': 'Other',
    'books': 'Other',
    'course': 'Other',
    'tuition': 'Other',
    'school': 'Other',
    
    // Other (catch-all)
    'other': 'Other',
    'miscellaneous': 'Other',
    'misc': 'Other'
  };
  
  // Return mapped category or 'Other' if not found
  const result = categoryMap[normalized] || 'Other';
  
  console.log(`[Validator] Category normalized: "${input}" → "${result}"`);
  return result;
};

/**
 * Deterministic date parsing with explicit rules
 * 
 * AUDIT FIX: Replaces LLM-based date parsing in systemPrompt.js
 * This ensures "today" ALWAYS returns current date, not "depends on context"
 * 
 * @param {string} input - Raw date string (e.g., "today", "yesterday", "2026-02-01")
 * @param {Date} referenceDate - Reference date for relative calculations (default: now)
 * @returns {string} ISO date string (YYYY-MM-DD)
 * @throws {Error} If date format is invalid
 */
export const parseDate = (input, referenceDate = new Date()) => {
  if (!input) {
    throw new Error('Date is required');
  }
  
  const normalized = input.toLowerCase().trim();
  
  // Handle relative dates (deterministic calculations)
  if (normalized === 'today') {
    const today = new Date(referenceDate);
    return today.toISOString().split('T')[0];
  }
  
  if (normalized === 'yesterday') {
    const yesterday = new Date(referenceDate);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
  
  // Handle ISO format (YYYY-MM-DD) - the standard
  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (isoPattern.test(input)) {
    // Validate it's a real date
    const parsed = new Date(input);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid date: ${input}`);
    }
    
    console.log(`[Validator] Date parsed: "${input}" → "${input}"`);
    return input;
  }
  
  // Handle common formats: DD/MM/YYYY or DD-MM-YYYY
  const commonPattern = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
  const match = input.match(commonPattern);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    const isoDate = `${year}-${month}-${day}`;
    
    // Validate it's a real date
    const parsed = new Date(isoDate);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid date: ${input}`);
    }
    
    console.log(`[Validator] Date parsed: "${input}" → "${isoDate}"`);
    return isoDate;
  }
  
  // If none of the above, it's invalid
  throw new Error(`Invalid date format: "${input}". Expected: "today", "yesterday", "YYYY-MM-DD", or "DD/MM/YYYY"`);
};

/**
 * Amount validation with business rules
 * 
 * AUDIT FIX: Ensures amounts are positive, numeric, and within reasonable limits
 * Prevents negative amounts, NaN, Infinity from reaching backend
 * 
 * @param {number|string} amount - Raw amount value
 * @returns {number} Validated and normalized amount (2 decimal places)
 * @throws {Error} If amount is invalid
 */
export const validateAmount = (amount) => {
  // Handle string inputs
  const parsed = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // Check if numeric
  if (typeof parsed !== 'number' || isNaN(parsed)) {
    throw new Error(`Amount must be a valid number, got: ${amount}`);
  }
  
  // Check if finite (reject Infinity)
  if (!isFinite(parsed)) {
    throw new Error('Amount must be a finite number');
  }
  
  // Business rule: Amounts must be positive
  if (parsed <= 0) {
    throw new Error(`Amount must be positive, got: ${parsed}`);
  }
  
  // Business rule: Reasonable maximum (prevent typos like 99999999)
  const MAX_AMOUNT = 10000000; // 10 million
  if (parsed > MAX_AMOUNT) {
    throw new Error(`Amount exceeds maximum allowed (${MAX_AMOUNT}), got: ${parsed}`);
  }
  
  // Normalize to 2 decimal places (standard for currency)
  const normalized = Math.round(parsed * 100) / 100;
  
  console.log(`[Validator] Amount validated: ${amount} → ${normalized}`);
  return normalized;
};

/**
 * Description validation and sanitization
 * 
 * AUDIT FIX: Ensures descriptions are non-empty and within length limits
 * 
 * @param {string} description - Raw description text
 * @returns {string} Validated and sanitized description
 * @throws {Error} If description is invalid
 */
export const validateDescription = (description) => {
  if (!description || typeof description !== 'string') {
    throw new Error('Description is required and must be a string');
  }
  
  // Trim whitespace
  const trimmed = description.trim();
  
  // Business rule: Minimum length
  if (trimmed.length === 0) {
    throw new Error('Description cannot be empty');
  }
  
  // Business rule: Maximum length
  const MAX_LENGTH = 200;
  if (trimmed.length > MAX_LENGTH) {
    throw new Error(`Description too long (max ${MAX_LENGTH} characters), got: ${trimmed.length}`);
  }
  
  console.log(`[Validator] Description validated: "${trimmed.substring(0, 50)}..."`);
  return trimmed;
};

/**
 * Validates and normalizes complete expense object
 * 
 * Convenience function that applies all validations at once
 * Used by MCP tools before sending to backend
 * 
 * @param {Object} expense - Raw expense data from LLM
 * @param {number|string} expense.amount - Expense amount
 * @param {string} expense.description - Expense description
 * @param {string} expense.category - Expense category
 * @param {string} expense.date - Expense date
 * @returns {Object} Fully validated and normalized expense
 * @throws {Error} If any field is invalid (with descriptive message)
 */
export const validateExpense = (expense) => {
  try {
    return {
      amount: validateAmount(expense.amount),
      description: validateDescription(expense.description),
      category: normalizeCategory(expense.category),
      date: parseDate(expense.date)
    };
  } catch (error) {
    // Re-throw with context about which validation failed
    throw new Error(`Expense validation failed: ${error.message}`);
  }
};
