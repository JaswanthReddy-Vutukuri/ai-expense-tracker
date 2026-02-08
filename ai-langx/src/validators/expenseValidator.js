/**
 * EXPENSE VALIDATOR MODULE - LangChain Version
 * 
 * Purpose:
 * - Provides deterministic validation and normalization of expense data
 * - Moves business logic OUT of LLM prompts INTO code
 * - Ensures consistent, predictable expense creation
 * 
 * Copied from ai/src/validators/expenseValidator.js to maintain MCP pattern
 */

/**
 * Deterministic category normalization with exhaustive mapping
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
 * Validate amount is a positive number
 * 
 * @param {number} amount - Amount to validate
 * @returns {number} Validated amount
 * @throws {Error} If amount is invalid
 */
export const validateAmount = (amount) => {
  const num = parseFloat(amount);
  
  if (isNaN(num)) {
    throw new Error('Amount must be a valid number');
  }
  
  if (num <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  
  if (num > 1000000) {
    throw new Error('Amount is too large (max: 1,000,000)');
  }
  
  return num;
};

/**
 * Validate and sanitize description
 * 
 * @param {string} description - Description to validate
 * @returns {string} Validated description
 */
export const validateDescription = (description) => {
  if (!description) {
    return '';
  }
  
  const trimmed = String(description).trim();
  
  if (trimmed.length > 500) {
    return trimmed.substring(0, 500);
  }
  
  return trimmed;
};
