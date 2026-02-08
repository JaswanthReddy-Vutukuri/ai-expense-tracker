/**
 * HELPER UTILITIES
 * 
 * PURPOSE:
 * - Common utility functions used across the application
 * - Trace ID generation
 * - Date helpers
 * 
 * NOTE: Some utilities are reused from custom implementation
 * Others are framework-specific helpers
 */

/**
 * Generate unique trace ID for request correlation
 * Same pattern as custom implementation for consistency
 * 
 * Format: trace_<timestamp>_<random>
 * Example: trace_1707388800000_a1b2c3d4
 * 
 * @returns {string} Unique trace ID
 */
export const generateTraceId = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `trace_${timestamp}_${random}`;
};

/**
 * Format date to YYYY-MM-DD
 * @param {Date} date - Date object
 * @returns {string} Formatted date
 */
export const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

/**
 * Get today's date in YYYY-MM-DD format
 * @returns {string} Today's date
 */
export const getToday = () => {
  return formatDate(new Date());
};

/**
 * Parse relative date (today, yesterday, etc.)
 * @param {string} dateStr - Date string
 * @returns {string} YYYY-MM-DD format
 */
export const parseRelativeDate = (dateStr) => {
  const lower = dateStr.toLowerCase().trim();
  const today = new Date();
  
  if (lower === 'today') {
    return formatDate(today);
  }
  
  if (lower === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDate(yesterday);
  }
  
  if (lower === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }
  
  // Assume it's already in YYYY-MM-DD format
  return dateStr;
};
