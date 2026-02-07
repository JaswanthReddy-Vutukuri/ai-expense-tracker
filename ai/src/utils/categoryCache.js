/**
 * CATEGORY CACHE MODULE
 * 
 * Purpose:
 * - Fetches and caches expense categories from backend
 * - Validates that validator mappings align with backend categories
 * - Reduces redundant API calls (was fetching on every expense creation)
 * 
 * Architecture fit:
 * - Initialized at server startup
 * - Used by createExpense and modifyExpense tools
 * - Refreshes periodically or on-demand
 */

import { backendClient } from './backendClient.js';

let cachedCategories = null;
let lastFetch = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch categories from backend with caching
 * @param {string} token - JWT token for authentication
 * @param {boolean} forceRefresh - Force refresh even if cache is valid
 * @returns {Promise<Array>} Array of category objects { id, name, icon }
 */
export const getCategories = async (token, forceRefresh = false) => {
  const now = Date.now();
  
  // Return cached categories if still valid
  if (!forceRefresh && cachedCategories && lastFetch && (now - lastFetch < CACHE_DURATION)) {
    console.log(`[Category Cache] Using cached categories (${cachedCategories.length} items)`);
    return cachedCategories;
  }
  
  // Fetch fresh categories from backend
  console.log('[Category Cache] Fetching categories from backend...');
  try {
    const categories = await backendClient.get('/expenses/categories', {}, token);
    
    cachedCategories = categories;
    lastFetch = now;
    
    console.log(`[Category Cache] Cached ${categories.length} categories:`, 
      categories.map(c => c.name).join(', '));
    
    return categories;
  } catch (error) {
    console.error('[Category Cache] Error fetching categories:', error.message);
    
    // If we have stale cache, return it as fallback
    if (cachedCategories) {
      console.warn('[Category Cache] Using stale cache as fallback');
      return cachedCategories;
    }
    
    throw error;
  }
};

/**
 * Find category by normalized name (case-insensitive)
 * @param {string} normalizedName - Category name from validator
 * @param {string} token - JWT token for authentication
 * @returns {Promise<Object|null>} Category object or null if not found
 */
export const findCategoryByName = async (normalizedName, token) => {
  console.log('[Category Cache] Finding category', { normalizedName, hasToken: !!token });
  
  const categories = await getCategories(token);
  
  console.log('[Category Cache] Available categories', { 
    count: categories.length,
    names: categories.map(c => c.name)
  });
  
  const match = categories.find(cat => 
    cat.name.toLowerCase() === normalizedName.toLowerCase()
  );
  
  if (!match) {
    console.error(`[Category Cache] No match found for "${normalizedName}". Available: ${categories.map(c => c.name).join(', ')}`);
  } else {
    console.log('[Category Cache] Category matched', { name: match.name, id: match.id });
  }
  
  return match || null;
};

/**
 * Validate that validator mappings align with backend categories
 * Logs warnings for any mismatches
 * @param {string} token - JWT token for authentication
 */
export const validateMappings = async (token) => {
  try {
    const categories = await getCategories(token);
    const backendCategories = categories.map(c => c.name);
    
    // Expected categories from validator
    const validatorCategories = ['Food', 'Transport', 'Entertainment', 'Shopping', 'Bills', 'Health', 'Other'];
    
    console.log('[Category Cache] Validating mappings...');
    console.log('  Backend categories:', backendCategories.join(', '));
    console.log('  Validator outputs:', validatorCategories.join(', '));
    
    // Check for mismatches
    const mismatches = validatorCategories.filter(vc => 
      !backendCategories.includes(vc)
    );
    
    if (mismatches.length > 0) {
      console.warn(`[Category Cache] WARNING: Validator maps to non-existent categories: ${mismatches.join(', ')}`);
      console.warn('  This will cause expense creation to fail. Update expenseValidator.js to match backend.');
    } else {
      console.log('[Category Cache] ✓ All validator mappings are valid');
    }
    
    return mismatches.length === 0;
  } catch (error) {
    console.error('[Category Cache] Could not validate mappings:', error.message);
    return false;
  }
};

/**
 * Clear the cache (useful for testing or manual refresh)
 */
export const clearCache = () => {
  cachedCategories = null;
  lastFetch = null;
  console.log('[Category Cache] Cache cleared');
};
