/**
 * RAG HANDLER - PDF Question Answering
 * 
 * PURPOSE:
 * - Handle RAG Q&A requests
 * - Integrate with chat system
 * - Handle streaming responses
 * 
 * LANGCHAIN INTEGRATION:
 * Uses the QA chain we built
 * 
 * COMPARE WITH: ai/src/handlers/ragQaHandler.js
 */

import { answerQuestion, answerQuestionStreaming } from '../rag/chains/qa.chain.js';
import { retrieveDocuments } from '../rag/retrievers/user.retriever.js';
import { getUserDocuments } from '../rag/vectorstore/memory.store.js';

/**
 * Handle RAG question answering
 * 
 * @param {string} question - User question
 * @param {number} userId - User ID
 * @param {Object} options - Configuration
 * @returns {Promise<Object>} Answer with sources
 */
export const handleRAGQuestion = async (question, userId, options = {}) => {
  try {
    console.log('[RAG Handler] Question:', question);
    console.log('[RAG Handler] User ID:', userId);
    
    // Check if user has any documents
    const userDocs = await getUserDocuments(userId);
    
    if (userDocs.length === 0) {
      return {
        answer: "You haven't uploaded any PDF documents yet. Please upload a PDF first using the upload endpoint.",
        sources: [],
        hasDocuments: false
      };
    }
    
    console.log('[RAG Handler] User has', userDocs.length, 'document chunks');
    
    // Answer using QA chain
    const result = await answerQuestion(question, userId, {
      k: options.k || 5,
      temperature: options.temperature || 0,
      returnSourceDocuments: true
    });
    
    console.log('[RAG Handler] Answer generated');
    
    return {
      ...result,
      hasDocuments: true,
      totalChunks: userDocs.length
    };
    
  } catch (error) {
    console.error('[RAG Handler] Error:', error.message);
    throw new Error(`Failed to answer question: ${error.message}`);
  }
};

/**
 * Handle RAG with streaming
 * 
 * @param {string} question - User question
 * @param {number} userId - User ID
 * @param {Function} onToken - Token callback
 * @returns {Promise<Object>} Complete answer
 */
export const handleRAGQuestionStreaming = async (question, userId, onToken) => {
  try {
    console.log('[RAG Handler Streaming] Starting');
    
    // Check documents
    const userDocs = await getUserDocuments(userId);
    
    if (userDocs.length === 0) {
      const message = "You haven't uploaded any PDF documents yet.";
      onToken(message);
      return {
        answer: message,
        sources: [],
        hasDocuments: false
      };
    }
    
    // Stream answer
    const result = await answerQuestionStreaming(question, userId, onToken);
    
    return {
      ...result,
      hasDocuments: true
    };
    
  } catch (error) {
    console.error('[RAG Handler Streaming] Error:', error.message);
    throw error;
  }
};

/**
 * Preview relevant documents without answering
 * Useful for debugging and UI
 * 
 * @param {string} query - Search query
 * @param {number} userId - User ID
 * @param {number} k - Number of results
 * @returns {Promise<Array>} Relevant chunks
 */
export const handleRAGPreview = async (query, userId, k = 5) => {
  try {
    console.log('[RAG Preview] Query:', query);
    
    const documents = await retrieveDocuments(query, userId, k);
    
    return documents.map(doc => ({
      filename: doc.metadata?.filename || 'unknown',
      page: doc.metadata?.page,
      chunkIndex: doc.metadata?.chunkIndex,
      content: doc.pageContent,
      similarity: doc.metadata?.similarityScore,
      uploadedAt: doc.metadata?.uploadedAt
    }));
    
  } catch (error) {
    console.error('[RAG Preview] Error:', error.message);
    throw error;
  }
};

/**
 * Compare expense data with PDF documents
 * Example: Check if receipt PDFs match app expenses
 * 
 * @param {Array} expenses - Expense data from app
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Comparison result
 */
export const handleRAGCompare = async (expenses, userId) => {
  try {
    console.log('[RAG Compare] Comparing', expenses.length, 'expenses with PDFs');
    
    // Check if user has PDFs
    const userDocs = await getUserDocuments(userId);
    
    if (userDocs.length === 0) {
      return {
        message: 'No PDF documents uploaded for comparison',
        mismatches: [],
        matches: []
      };
    }
    
    // Search for each expense in PDFs
    const comparisons = [];
    
    for (const expense of expenses.slice(0, 10)) {  // Limit to 10 for performance
      const searchQuery = `expense ${expense.description} amount ${expense.amount} date ${expense.date}`;
      
      const docs = await retrieveDocuments(searchQuery, userId, 3);
      
      comparisons.push({
        expense,
        foundInPDF: docs.length > 0,
        bestMatch: docs[0] ? {
          filename: docs[0].metadata?.filename,
          similarity: docs[0].metadata?.similarityScore,
          snippet: docs[0].pageContent.substring(0, 150)
        } : null
      });
    }
    
    const matches = comparisons.filter(c => c.foundInPDF);
    const mismatches = comparisons.filter(c => !c.foundInPDF);
    
    console.log('[RAG Compare] Matches:', matches.length, 'Mismatches:', mismatches.length);
    
    return {
      message: `Found ${matches.length} matches and ${mismatches.length} mismatches`,
      matches,
      mismatches,
      totalExpenses: expenses.length,
      totalChecked: comparisons.length
    };
    
  } catch (error) {
    console.error('[RAG Compare] Error:', error.message);
    throw error;
  }
};

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * Custom (ai/src/handlers/ragQaHandler.js):
 * ```javascript
 * export const handleRAGQuestionCustom = async (question, userId) => {
 *   // Manual retrieval
 *   const chunks = await searchSimilarChunks(question, userId, 5);
 *   
 *   if (chunks.length === 0) {
 *     return { answer: 'No documents found' };
 *   }
 *   
 *   // Manual context
 *   const context = chunks.map(c => c.text).join('\n\n');
 *   
 *   // Manual prompt
 *   const prompt = `Answer based on: ${context}\n\nQ: ${question}`;
 *   
 *   // Manual LLM call
 *   const response = await openai.chat.completions.create({
 *     model: 'gpt-4o-mini',
 *     messages: [{ role: 'user', content: prompt }],
 *     temperature: 0
 *   });
 *   
 *   return {
 *     answer: response.choices[0].message.content,
 *     sources: chunks.map(c => ({ filename: c.filename }))
 *   };
 * };
 * ```
 * 
 * LangChain (this file):
 * ```javascript
 * export const handleRAGQuestion = async (question, userId) => {
 *   const result = await answerQuestion(question, userId);
 *   return result;
 * };
 * ```
 * 
 * ADVANTAGES:
 * ✅ All RAG logic in chain
 * ✅ ~50 LOC vs ~150 LOC custom
 * ✅ Better error handling
 * ✅ Streaming built-in
 * ✅ Source attribution automatic
 * ✅ Easy to add conversation history
 * ✅ Easy to add multi-query, reranking
 * 
 * INTEGRATION WITH CHAT:
 * 
 * When intent = "rag_question":
 * ```javascript
 * if (intent === 'rag_question') {
 *   const result = await handleRAGQuestion(userMessage, userId);
 *   return result.answer;
 * }
 * ```
 * 
 * ADVANCED FEATURES POSSIBLE:
 * 
 * 1. Conversational RAG (remember chat history)
 * 2. Multi-document reasoning (compare PDFs)
 * 3. Citation tracking (exact page numbers)
 * 4. Confidence scoring (trust levels)
 * 5. Fact-checking (cross-reference multiple sources)
 * 
 * All easy with LangChain chains!
 */
