/**
 * RAG COMPARE HANDLER
 * 
 * Purpose:
 * - Compares PDF expense data with app expense data
 * - Performs computational diff (NOT in LLM)
 * - Uses LLM only for explaining results
 * 
 * Why it exists:
 * - Provides data reconciliation capabilities
 * - Separates computation from interpretation
 * - Enables expense verification workflows
 * 
 * Architecture fit:
 * - Called by intent router when intent = RAG_COMPARE
 * - Uses comparison engine for diff calculation
 * - Uses LLM only for natural language explanation
 */

import OpenAI from 'openai';
import { compareExpenses } from '../comparison/expenseComparator.js';
import { extractExpensesFromVectorStore } from '../rag/vectorStore.js';
import { backendClient } from '../utils/backendClient.js';

const openaiConfig = {
  apiKey: process.env.LLM_API_KEY
};
if (process.env.LLM_BASE_URL) {
  openaiConfig.baseURL = process.env.LLM_BASE_URL;
}
const openai = new OpenAI(openaiConfig);

/**
 * Formats comparison results into natural language
 * @param {Object} comparisonResult - Structured diff from comparison engine
 * @returns {Promise<string>} Natural language explanation
 */
const explainComparison = async (comparisonResult) => {
  const { summary, differences, pdfOnly, appOnly, matched } = comparisonResult;

  const prompt = `You are a financial assistant explaining expense comparison results.

Comparison Summary:
- Total PDF Expenses: ${summary.pdfTotal.count} items, Amount: ₹${summary.pdfTotal.amount}
- Total App Expenses: ${summary.appTotal.count} items, Amount: ₹${summary.appTotal.amount}
- Matched: ${matched.length} expenses
- Only in PDF: ${pdfOnly.length} expenses
- Only in App: ${appOnly.length} expenses

Differences Found:
${differences.length > 0 ? differences.map(d => `- ${d.description}`).join('\n') : 'None'}

Expenses only in PDF (not tracked in app):
${pdfOnly.length > 0 ? pdfOnly.map(e => `- ₹${e.amount} for ${e.description} on ${e.date}`).join('\n') : 'None'}

Expenses only in App (not in PDF):
${appOnly.length > 0 ? appOnly.map(e => `- ₹${e.amount} for ${e.description} on ${e.date}`).join('\n') : 'None'}

Provide a concise, helpful explanation focusing on:
1. Overall match status (good/needs attention)
2. Key discrepancies if any
3. Actionable recommendation

Keep it under 150 words.`;

  const response = await openai.chat.completions.create({
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a precise financial analysis assistant.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.4,
    max_tokens: 300
  });

  return response.choices[0].message.content.trim();
};

/**
 * Handles expense comparison between PDF and app data
 * 
 * User Isolation in Comparison
 * RECONCILIATION UPDATE: Returns structured diff for downstream reconciliation
 * 
 * WHY STRUCTURED OUTPUT:
 * - Enables programmatic reconciliation without LLM interpretation
 * - Provides auditability: exact expenses can be traced
 * - Allows reconciliation planner to make deterministic decisions
 * - Separates data analysis from business logic execution
 * 
 * @param {string} userMessage - User's comparison request
 * @param {string} authToken - JWT token for backend authentication
 * @param {number} userId - User ID for document filtering
 * @param {Object} options - Handler options
 * @param {boolean} options.returnStructured - If true, returns structured diff instead of text explanation
 * @returns {Promise<string|Object>} Comparison results (text explanation or structured diff)
 */
export const handleRagCompare = async (userMessage, authToken, userId, options = {}) => {
  const { returnStructured = false } = options;
  
  console.log(`[RAG Compare Handler] Processing expense comparison for user ${userId || 'unknown (JWT_SECRET not configured)'}`);
  
  // Validate userId parameter (allow null for backward compatibility)
  if (userId === undefined) {
    throw new Error('userId parameter is required for RAG Compare');
  }
  
  try {
    // Step 1: Extract expenses from user's uploaded PDF documents only
    // Pass userId to filter documents
    console.log(`[RAG Compare Handler] Extracting PDF expenses for user ${userId}`);
    const pdfExpenses = await extractExpensesFromVectorStore(userId);
    
    console.log(`[RAG Compare Handler] Found ${pdfExpenses.length} PDF expenses`);
    
    if (pdfExpenses.length === 0) {
      return returnStructured 
        ? { matched: [], pdf_only: [], app_only: [], error: 'No PDF data' }
        : "I don't have any PDF expense data to compare. Please upload a PDF expense statement first.";
    }
    
    // Step 2: Fetch app expenses from backend
    // Backend returns paginated response: { data: [...], total, page, limit }
    console.log(`[RAG Compare Handler] Fetching app expenses from backend`);
    const response = await backendClient.get('/expenses', { limit: 1000 }, authToken); // Get more expenses for comparison
    
    console.log(`[RAG Compare Handler] Backend response:`, { 
      responseType: typeof response,
      isArray: Array.isArray(response),
      hasData: !!response?.data,
      dataIsArray: Array.isArray(response?.data),
      dataLength: response?.data?.length || 0,
      total: response?.total
    });
    
    // Extract expenses array from paginated response
    const appExpenses = response?.data || response || [];
    
    if (!Array.isArray(appExpenses) || appExpenses.length === 0) {
      console.warn('[RAG Compare Handler] No app expenses found', { 
        responseType: typeof response,
        isArray: Array.isArray(response),
        hasData: !!response?.data,
        dataLength: response?.data?.length || 0
      });
      
      return returnStructured
        ? { matched: [], pdf_only: pdfExpenses, app_only: [], error: 'No app data' }
        : "You don't have any expenses tracked in the app yet. The comparison requires both PDF and app data.";
    }
    
    console.log(`[RAG Compare Handler] Comparing ${pdfExpenses.length} PDF expenses with ${appExpenses.length} app expenses`);
    
    // Step 3: Perform code-based comparison (NOT in LLM)
    const comparisonResult = compareExpenses(pdfExpenses, appExpenses);
    
    // RECONCILIATION UPDATE: Return structured diff for programmatic use
    if (returnStructured) {
      const structuredDiff = {
        matched: comparisonResult.matched || [],
        pdf_only: comparisonResult.pdfOnly || [],
        app_only: comparisonResult.appOnly || [],
        summary: comparisonResult.summary
      };
      
      console.log(`[RAG Compare Handler] Structured diff: ${structuredDiff.matched.length} matched, ${structuredDiff.pdf_only.length} PDF-only, ${structuredDiff.app_only.length} app-only`);
      
      return structuredDiff;
    }
    
    // Step 4: Use LLM to explain results in natural language (for non-structured requests)
    const explanation = await explainComparison(comparisonResult);
    
    return explanation;
  } catch (error) {
    console.error('[RAG Compare Handler] Error:', error.message);
    
    if (error.message.includes('No documents')) {
      return returnStructured
        ? { matched: [], pdf_only: [], app_only: [], error: 'No documents' }
        : "I don't have any uploaded PDF documents yet. Please upload a PDF expense statement first.";
    }
    
    throw error;
  }
};
