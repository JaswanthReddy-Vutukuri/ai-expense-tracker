/**
 * RAG COMPARE HANDLER - LangChain-based comparison
 * 
 * PURPOSE:
 * - Compare PDF expenses with app expenses
 * - Use LangChain for extraction and explanation
 * - Maintain deterministic comparison logic
 * 
 * LANGCHAIN CONCEPTS:
 * ✅ LLM for expense extraction (robust parsing)
 * ✅ LLM for natural language explanation
 * ✅ Deterministic comparison algorithm (NOT in LLM)
 * ✅ Structured output for downstream processing
 * 
 * ARCHITECTURE:
 * - Called by intent router when intent = rag_compare
 * - Uses expense extractor (LangChain-based)
 * - Uses comparison engine (deterministic)
 * - Uses LLM only for explanation
 * 
 * COMPARE WITH: ai/src/handlers/ragCompareHandler.js
 * - Similar flow, different extraction method
 * - Custom: Regex patterns
 * - LangChain: LLM extraction
 */

import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { extractExpensesFromPDF } from '../rag/extractors/expense.extractor.js';
import { compareExpenses } from '../comparison/expenseComparator.js';
import axios from 'axios';

/**
 * Generate natural language explanation from comparison result
 * 
 * LANGCHAIN PATTERN:
 * - Use LLM ONLY for interpretation
 * - Comparison logic runs deterministically
 * - LLM explains the structured diff
 * 
 * WHY SEPARATE:
 * - Comparison must be deterministic/auditable
 * - LLM good at explanation, not computation
 * - Best of both worlds
 * 
 * @param {Object} comparisonResult - Structured diff from comparison engine
 * @returns {Promise<string>} Natural language explanation
 */
const explainComparison = async (comparisonResult) => {
  const { summary, differences, pdfOnly, appOnly, matched } = comparisonResult;
  
  try {
    // Create LLM
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.4, // Slightly creative for explanations
      maxTokens: 300,
      openAIApiKey: process.env.OPENAI_API_KEY
    });
    
    // Explanation prompt
    const promptTemplate = PromptTemplate.fromTemplate(`
You are a financial assistant explaining expense comparison results.

Comparison Summary:
- Total PDF Expenses: {pdfCount} items, Amount: ₹{pdfAmount}
- Total App Expenses: {appCount} items, Amount: ₹{appAmount}
- Matched: {matchedCount} expenses
- Only in PDF: {pdfOnlyCount} expenses
- Only in App: {appOnlyCount} expenses

Differences Found:
{differencesList}

Expenses only in PDF (not tracked in app):
{pdfOnlyList}

Expenses only in App (not in PDF):
{appOnlyList}

Provide a concise, helpful explanation focusing on:
1. Overall match status (good/needs attention)
2. Key discrepancies if any
3. Actionable recommendation

Keep it under 150 words.
`);
    
    // Format lists
    const differencesList = differences.length > 0 
      ? differences.map(d => `- ${d.description}`).join('\n')
      : 'None';
    
    const pdfOnlyList = pdfOnly.length > 0
      ? pdfOnly.slice(0, 5).map(e => `- ₹${e.amount} for ${e.description} on ${e.date || 'unknown'}`).join('\n')
      : 'None';
    
    const appOnlyList = appOnly.length > 0
      ? appOnly.slice(0, 5).map(e => `- ₹${e.amount} for ${e.description || e.category_name} on ${e.date || e.expense_date}`).join('\n')
      : 'None';
    
    // Format prompt
    const prompt = await promptTemplate.format({
      pdfCount: summary.pdfTotal.count,
      pdfAmount: summary.pdfTotal.amount,
      appCount: summary.appTotal.count,
      appAmount: summary.appTotal.amount,
      matchedCount: matched.length,
      pdfOnlyCount: pdfOnly.length,
      appOnlyCount: appOnly.length,
      differencesList,
      pdfOnlyList,
      appOnlyList
    });
    
    console.log('[Compare Handler] Generating explanation...');
    
    // Get explanation from LLM
    const response = await llm.invoke(prompt);
    
    return response.content.trim();
    
  } catch (error) {
    console.error('[Compare Handler] Explanation error:', error.message);
    // Fallback to simple summary
    return generateFallbackSummary(comparisonResult);
  }
};

/**
 * Fallback summary if LLM fails
 * @param {Object} comparisonResult - Comparison result
 * @returns {string} Simple text summary
 */
const generateFallbackSummary = (comparisonResult) => {
  const { summary, matched, pdfOnly, appOnly } = comparisonResult;
  
  let text = `📊 Comparison Summary:\n\n`;
  text += `PDF: ${summary.pdfTotal.count} expenses, ₹${summary.pdfTotal.amount}\n`;
  text += `App: ${summary.appTotal.count} expenses, ₹${summary.appTotal.amount}\n`;
  text += `Matched: ${matched.length} expenses\n\n`;
  
  if (pdfOnly.length > 0) {
    text += `⚠️ ${pdfOnly.length} expenses in PDF but not in app\n`;
  }
  
  if (appOnly.length > 0) {
    text += `⚠️ ${appOnly.length} expenses in app but not in PDF\n`;
  }
  
  if (pdfOnly.length === 0 && appOnly.length === 0) {
    text += `✅ Perfect match! All expenses are reconciled.`;
  }
  
  return text;
};

/**
 * Handle comparison request
 * 
 * WORKFLOW:
 * 1. Extract expenses from PDF (LangChain LLM)
 * 2. Fetch expenses from backend API
 * 3. Compare using deterministic algorithm
 * 4. Explain using LangChain LLM
 * 
 * LANGCHAIN BENEFITS:
 * - Robust PDF parsing (vs regex)
 * - Natural language explanation
 * - Follows LangChain patterns
 * 
 * @param {string} userMessage - User's comparison request
 * @param {number} userId - User ID for filtering
 * @param {string} authToken - JWT token for backend
 * @param {Object} options - Handler options
 * @returns {Promise<string|Object>} Comparison results
 */
export const handleComparison = async (userMessage, userId, authToken, options = {}) => {
  const { returnStructured = false } = options;
  
  console.log('[Compare Handler] Processing comparison for user', userId);
  
  try {
    // Step 1: Extract expenses from PDF using LangChain
    console.log('[Compare Handler] Extracting PDF expenses with LangChain...');
    const pdfExpenses = await extractExpensesFromPDF(userId);
    
    console.log('[Compare Handler] Found', pdfExpenses.length, 'PDF expenses');
    
    if (pdfExpenses.length === 0) {
      return returnStructured
        ? { matched: [], pdfOnly: [], appOnly: [], error: 'No PDF data' }
        : "I don't have any PDF expense data to compare. Please upload a PDF expense statement first.";
    }
    
    // Step 2: Fetch app expenses from backend
    console.log('[Compare Handler] Fetching app expenses from backend...');
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    
    const response = await axios.get(`${backendUrl}/api/expenses`, {
      params: { limit: 1000 },
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    console.log('[Compare Handler] Backend response:', {
      status: response.status,
      hasData: !!response.data,
      dataKeys: response.data ? Object.keys(response.data) : []
    });
    
    // Extract expenses array from response
    const appExpenses = response.data?.data || response.data || [];
    
    if (!Array.isArray(appExpenses)) {
      console.error('[Compare Handler] Backend response is not an array:', typeof appExpenses);
      return returnStructured
        ? { matched: [], pdfOnly: pdfExpenses, appOnly: [], error: 'Invalid backend response' }
        : "Error fetching app expenses. Please try again.";
    }
    
    console.log('[Compare Handler] Found', appExpenses.length, 'app expenses');
    
    // Step 3: Compare using deterministic algorithm
    console.log('[Compare Handler] Running comparison algorithm...');
    const comparisonResult = compareExpenses(pdfExpenses, appExpenses);
    
    console.log('[Compare Handler] Comparison complete:', {
      matched: comparisonResult.matched.length,
      pdfOnly: comparisonResult.pdfOnly.length,
      appOnly: comparisonResult.appOnly.length
    });
    
    // Return structured result if requested (for reconciliation)
    if (returnStructured) {
      return comparisonResult;
    }
    
    // Step 4: Generate natural language explanation using LangChain
    console.log('[Compare Handler] Generating explanation...');
    const explanation = await explainComparison(comparisonResult);
    
    return explanation;
    
  } catch (error) {
    console.error('[Compare Handler] Error:', error.message);
    console.error('[Compare Handler] Stack:', error.stack);
    
    if (returnStructured) {
      return { matched: [], pdfOnly: [], appOnly: [], error: error.message };
    }
    
    return `I encountered an error comparing expenses: ${error.message}. Please try again.`;
  }
};
