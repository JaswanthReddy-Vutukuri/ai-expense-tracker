/**
 * EXPENSE EXTRACTOR - LangChain-based Structured Extraction
 * 
 * PURPOSE:
 * - Extract structured expense data from PDF documents
 * - Use LLM for robust parsing (vs regex in custom implementation)
 * - Return array of expense objects for comparison
 * 
 * LANGCHAIN CONCEPTS:
 * ✅ ChatOpenAI with structured output parsing
 * ✅ PromptTemplate for extraction
 * ✅ JSON schema validation
 * 
 * WHY LLM EXTRACTION:
 * - Handles various PDF formats automatically
 * - No manual regex patterns needed
 * - More robust than custom parsing
 * - Fits LangChain architecture
 * 
 * COMPARE WITH: ai/src/rag/vectorStore.js:extractExpensesFromVectorStore()
 * - Custom: Manual regex patterns for each format
 * - LangChain: LLM understands formats automatically
 * 
 * ARCHITECTURE:
 * - Used by comparison handler
 * - Reads from vector store
 * - Returns structured expense array
 */

import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { getUserDocuments } from '../vectorstore/memory.store.js';

/**
 * Extract expenses from PDF documents using LLM
 * 
 * LANGCHAIN PATTERN:
 * 1. Retrieve user's PDF documents from vector store
 * 2. Concatenate document text
 * 3. Use LLM to extract structured expense data
 * 4. Parse JSON response into expense objects
 * 
 * WHY THIS APPROACH:
 * - LLM handles various PDF formats
 * - No manual pattern maintenance
 * - More accurate than regex
 * - Natural fit with LangChain stack
 * 
 * @param {number} userId - User ID to filter documents
 * @returns {Promise<Array>} Array of expense objects
 */
export const extractExpensesFromPDF = async (userId) => {
  try {
    console.log('[Expense Extractor] Extracting expenses for user', userId);
    
    // Get user's PDF documents from vector store
    const documents = await getUserDocuments(userId);
    
    console.log('[Expense Extractor] Retrieved', documents.length, 'document chunks');
    
    if (documents.length === 0) {
      console.log('[Expense Extractor] No documents found for user');
      return [];
    }
    
    // Concatenate document text (limit to avoid token limits)
    const maxChars = 10000; // Stay under token limits
    let combinedText = documents
      .map(doc => doc.pageContent)
      .join('\n\n')
      .substring(0, maxChars);
    
    console.log('[Expense Extractor] Combined text length:', combinedText.length, 'chars');
    
    // Create LLM for extraction
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0, // Deterministic for data extraction
      openAIApiKey: process.env.OPENAI_API_KEY
    });
    
    // Extraction prompt
    const extractionPrompt = PromptTemplate.fromTemplate(`
You are a data extraction assistant analyzing expense documents.

Extract ALL expense transactions from the following document text.
For each expense, identify:
- amount (numeric value)
- description (what the expense was for)
- date (in YYYY-MM-DD format if possible, or any date format found)
- category (if mentioned: Food, Transport, Shopping, Bills, etc.)

Document Text:
{documentText}

CRITICAL: Return ONLY valid JSON array with this exact structure:
[
  {{
    "amount": 123.45,
    "description": "Coffee shop",
    "date": "2026-02-01",
    "category": "Food"
  }}
]

If no expenses found, return empty array: []

REMEMBER: ONLY return the JSON array, no other text.
`);
    
    // Format prompt
    const prompt = await extractionPrompt.format({
      documentText: combinedText
    });
    
    console.log('[Expense Extractor] Calling LLM for extraction...');
    
    // Get LLM response
    const response = await llm.invoke(prompt);
    
    console.log('[Expense Extractor] LLM response received');
    console.log('[Expense Extractor] Response preview:', response.content.substring(0, 200));
    
    // Parse JSON response
    let expenses = [];
    try {
      // Clean response (remove markdown code blocks if present)
      let jsonText = response.content.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '');
      }
      
      expenses = JSON.parse(jsonText);
      
      if (!Array.isArray(expenses)) {
        console.warn('[Expense Extractor] Response is not an array:', typeof expenses);
        expenses = [];
      }
      
      console.log('[Expense Extractor] Extracted', expenses.length, 'expenses');
      
      // Add source metadata
      expenses = expenses.map(exp => ({
        ...exp,
        source: 'PDF',
        userId
      }));
      
    } catch (parseError) {
      console.error('[Expense Extractor] JSON parse error:', parseError.message);
      console.error('[Expense Extractor] Raw response:', response.content);
      expenses = [];
    }
    
    return expenses;
    
  } catch (error) {
    console.error('[Expense Extractor] Error:', error.message);
    throw new Error(`Failed to extract expenses: ${error.message}`);
  }
};

/**
 * Extract expenses with fallback to simple pattern matching
 * 
 * Provides graceful degradation if LLM extraction fails
 * 
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of expenses
 */
export const extractExpensesWithFallback = async (userId) => {
  try {
    const expenses = await extractExpensesFromPDF(userId);
    
    if (expenses.length > 0) {
      return expenses;
    }
    
    // Fallback: Simple regex extraction
    console.log('[Expense Extractor] Using fallback regex extraction');
    
    const documents = await getUserDocuments(userId);
    const expenses_fallback = [];
    
    for (const doc of documents) {
      // Simple pattern: amount followed by description
      const pattern = /(\d+(?:\.\d{2})?)\s*(?:₹|Rs\.?|INR|\$)?\s+(?:for|on)?\s*([a-zA-Z\s]+)/gi;
      let match;
      
      while ((match = pattern.exec(doc.pageContent)) !== null) {
        expenses_fallback.push({
          amount: parseFloat(match[1]),
          description: match[2].trim(),
          date: null,
          category: 'Other',
          source: 'PDF',
          userId
        });
      }
    }
    
    console.log('[Expense Extractor] Fallback extracted', expenses_fallback.length, 'expenses');
    
    return expenses_fallback;
    
  } catch (error) {
    console.error('[Expense Extractor] Extraction failed:', error.message);
    return [];
  }
};
