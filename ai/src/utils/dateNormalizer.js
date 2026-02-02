/**
 * DATE NORMALIZER - CRITICAL UTILITY
 * 
 * PURPOSE:
 * - Convert ALL date formats to backend-compatible YYYY-MM-DD
 * - Handle PDF extraction formats (Feb 3, 2026, DD/MM/YYYY, etc.)
 * - Prevent date format mismatch errors during sync
 * 
 * WHY THIS EXISTS:
 * - PDF extraction produces dates in various formats
 * - Backend expects strict YYYY-MM-DD format
 * - Date validation MUST happen BEFORE backend calls
 * - 90% of sync failures were due to date format mismatches
 * 
 * SUPPORTED FORMATS:
 * - "Feb 3, 2026" (month abbreviation)
 * - "February 3, 2026" (full month name)
 * - "2026-02-03" (ISO format - passthrough)
 * - "03/02/2026" (DD/MM/YYYY)
 * - "2026/02/03" (YYYY/MM/DD)
 * - "today" / "yesterday" (relative dates)
 * 
 * WHY BACKEND STRICTNESS EXISTS:
 * - Database storage requires consistent format
 * - Date comparisons fail with mixed formats
 * - Timezone issues require ISO dates
 * - Financial compliance requires unambiguous dates
 * 
 * NORMALIZATION MUST HAPPEN BEFORE:
 * - MCP tool execution
 * - Backend API calls
 * - Sync plan validation
 */

/**
 * Month name to number mapping
 */
const MONTH_NAMES = {
  'january': 1, 'jan': 1,
  'february': 2, 'feb': 2,
  'march': 3, 'mar': 3,
  'april': 4, 'apr': 4,
  'may': 5,
  'june': 6, 'jun': 6,
  'july': 7, 'jul': 7,
  'august': 8, 'aug': 8,
  'september': 9, 'sep': 9, 'sept': 9,
  'october': 10, 'oct': 10,
  'november': 11, 'nov': 11,
  'december': 12, 'dec': 12
};

/**
 * Normalizes a date string to YYYY-MM-DD format
 * 
 * NORMALIZATION STRATEGY:
 * 1. Handle relative dates (today, yesterday)
 * 2. Try ISO format (YYYY-MM-DD) - passthrough
 * 3. Try month name formats (Feb 3, 2026)
 * 4. Try slash formats (DD/MM/YYYY, YYYY/MM/DD)
 * 5. Try JavaScript Date parsing (last resort)
 * 6. Reject if all fail
 * 
 * WHY EXPLICIT PATTERNS:
 * - JavaScript Date parsing is inconsistent
 * - Explicit parsing is deterministic
 * - Easier to debug failures
 * - Clear error messages
 * 
 * @param {string} dateStr - Date string in any supported format
 * @returns {string} Normalized date in YYYY-MM-DD format
 * @throws {Error} If date cannot be normalized
 */
export const normalizeDateToISO = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error('Date is required and must be a string');
  }
  
  const trimmed = dateStr.trim();
  
  // ========================================================================
  // PATTERN 1: Relative dates
  // ========================================================================
  if (trimmed.toLowerCase() === 'today') {
    return formatDateToISO(new Date());
  }
  
  if (trimmed.toLowerCase() === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDateToISO(yesterday);
  }
  
  // ========================================================================
  // PATTERN 2: Already ISO format (YYYY-MM-DD)
  // ========================================================================
  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (isoPattern.test(trimmed)) {
    // Validate it's a real date
    const date = new Date(trimmed + 'T00:00:00');
    if (!isNaN(date.getTime())) {
      return trimmed; // Already normalized
    }
  }
  
  // ========================================================================
  // PATTERN 3: Month name formats
  // Examples: "Feb 3, 2026", "February 3, 2026"
  // WHY: PDF extraction often produces this format
  // ========================================================================
  const monthNamePattern = /^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i;
  const monthNameMatch = trimmed.match(monthNamePattern);
  
  if (monthNameMatch) {
    const monthName = monthNameMatch[1].toLowerCase();
    const day = parseInt(monthNameMatch[2], 10);
    const year = parseInt(monthNameMatch[3], 10);
    
    const monthNum = MONTH_NAMES[monthName];
    if (monthNum) {
      const date = new Date(year, monthNum - 1, day);
      if (!isNaN(date.getTime()) && date.getMonth() === monthNum - 1) {
        return formatDateToISO(date);
      }
    }
  }
  
  // ========================================================================
  // PATTERN 4: Slash formats
  // Examples: "03/02/2026" (DD/MM/YYYY), "2026/02/03" (YYYY/MM/DD)
  // WHY: Common in international date formats
  // ========================================================================
  
  // Try YYYY/MM/DD or YYYY-MM-DD
  const yyyymmddPattern = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/;
  const yyyymmddMatch = trimmed.match(yyyymmddPattern);
  
  if (yyyymmddMatch) {
    const year = parseInt(yyyymmddMatch[1], 10);
    const month = parseInt(yyyymmddMatch[2], 10);
    const day = parseInt(yyyymmddMatch[3], 10);
    
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime()) && date.getMonth() === month - 1) {
      return formatDateToISO(date);
    }
  }
  
  // Try DD/MM/YYYY
  const ddmmyyyyPattern = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const ddmmyyyyMatch = trimmed.match(ddmmyyyyPattern);
  
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10);
    const month = parseInt(ddmmyyyyMatch[2], 10);
    const year = parseInt(ddmmyyyyMatch[3], 10);
    
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime()) && date.getMonth() === month - 1) {
      return formatDateToISO(date);
    }
  }
  
  // ========================================================================
  // PATTERN 5: JavaScript Date parsing (last resort)
  // WHY: Fallback for edge cases
  // WARNING: Less reliable, use explicit patterns when possible
  // ========================================================================
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return formatDateToISO(date);
  }
  
  // ========================================================================
  // REJECTION: Cannot normalize
  // ========================================================================
  throw new Error(`Cannot normalize date "${dateStr}" to YYYY-MM-DD format. Supported formats: YYYY-MM-DD, Feb 3 2026, DD/MM/YYYY, today, yesterday`);
};

/**
 * Formats a Date object to YYYY-MM-DD string
 * 
 * WHY NOT date.toISOString():
 * - toISOString() includes time and timezone (YYYY-MM-DDTHH:mm:ss.sssZ)
 * - We need date-only format
 * - Timezone conversion can shift dates
 * 
 * @param {Date} date - JavaScript Date object
 * @returns {string} Date in YYYY-MM-DD format
 */
const formatDateToISO = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Validates if a date string can be normalized
 * 
 * USE CASE:
 * - Pre-validation before sync execution
 * - Identify invalid dates early
 * - Provide clear error messages
 * 
 * @param {string} dateStr - Date string to validate
 * @returns {Object} { valid: boolean, normalized: string|null, error: string|null }
 */
export const validateAndNormalizeDate = (dateStr) => {
  try {
    const normalized = normalizeDateToISO(dateStr);
    return {
      valid: true,
      normalized,
      error: null
    };
  } catch (error) {
    return {
      valid: false,
      normalized: null,
      error: error.message
    };
  }
};

/**
 * Normalizes all date fields in an expense object
 * 
 * WHY:
 * - Ensures consistency before backend calls
 * - Prevents date format errors
 * - Single point of normalization
 * 
 * @param {Object} expense - Expense with date field
 * @returns {Object} Expense with normalized date
 * @throws {Error} If date normalization fails
 */
export const normalizeExpenseDates = (expense) => {
  if (!expense) {
    throw new Error('Expense object is required');
  }
  
  const normalized = { ...expense };
  
  // Normalize primary date field (could be 'date', 'expense_date', or 'dateStr')
  if (expense.date) {
    normalized.date = normalizeDateToISO(expense.date);
  }
  
  if (expense.expense_date) {
    normalized.expense_date = normalizeDateToISO(expense.expense_date);
  }
  
  if (expense.dateStr) {
    normalized.dateStr = normalizeDateToISO(expense.dateStr);
  }
  
  return normalized;
};
