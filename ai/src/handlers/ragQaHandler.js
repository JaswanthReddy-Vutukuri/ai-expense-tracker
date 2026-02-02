/**
 * RAG QA HANDLER
 * 
 * Purpose:
 * - Answers questions from uploaded PDF expense statements
 * - Retrieves relevant chunks using similarity search
 * - Augments LLM prompt with retrieved context
 * 
 * Why it exists:
 * - Enables document-based intelligence
 * - Separates RAG logic from transactional operations
 * - Implements retrieval-augmented generation pattern
 * 
 * Architecture fit:
 * - Called by intent router when intent = RAG_QA
 * - Uses vector store for similarity search
 * - Returns answers with source citations
 */

import OpenAI from 'openai';
import { searchSimilarChunks } from '../rag/search.js';

const openaiConfig = {
  apiKey: process.env.LLM_API_KEY
};
if (process.env.LLM_BASE_URL) {
  openaiConfig.baseURL = process.env.LLM_BASE_URL;
}
const openai = new OpenAI(openaiConfig);

/**
 * Generates answer from retrieved document chunks
 * @param {string} question - User's question
 * @param {Array} retrievedChunks - Relevant document chunks with metadata
 * @returns {Promise<string>} Natural language answer with sources
 */
const generateAnswer = async (question, retrievedChunks) => {
  if (retrievedChunks.length === 0) {
    return "I don't have any uploaded documents to answer this question. Please upload a PDF expense statement first using the upload endpoint.";
  }

  // Build context from retrieved chunks
  const context = retrievedChunks
    .map((chunk, idx) => `[Source ${idx + 1}]: ${chunk.text}`)
    .join('\n\n');

  const prompt = `You are an AI assistant analyzing expense documents. Answer the user's question based ONLY on the provided document excerpts.

Document Context:
${context}

User Question: ${question}

Instructions:
- Answer accurately based only on the provided context
- If the answer isn't in the context, say so
- Cite sources using [Source N] notation
- Be concise and precise
- Format numbers as currency when relevant

Answer:`;

  const response = await openai.chat.completions.create({
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a precise document analysis assistant.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 500
  });

  return response.choices[0].message.content.trim();
};

/**
 * Handles RAG-based question answering
 * 
 * AUDIT FIX: Part 6 - User Isolation in RAG Query
 * Now accepts userId and passes to search for user-scoped results
 * 
 * @param {string} userMessage - User's question about uploaded documents
 * @param {string} authToken - JWT token (for backend API calls)
 * @param {number} userId - User ID for document filtering
 * @returns {Promise<string>} Answer with source citations
 */
export const handleRagQA = async (userMessage, authToken, userId) => {
  console.log(`[RAG QA Handler] Processing document question for user ${userId || 'unknown (JWT_SECRET not configured)'}`);
  
  // AUDIT FIX: Validate userId parameter (allow null for backward compatibility)
  if (userId === undefined) {
    throw new Error('userId parameter is required for RAG QA');
  }
  
  try {
    // AUDIT FIX: Pass userId to search for user-scoped retrieval
    const topK = 5; // Number of chunks to retrieve
    const retrievedChunks = await searchSimilarChunks(userMessage, userId, topK);
    
    console.log(`[RAG QA Handler] Retrieved ${retrievedChunks.length} relevant chunks`);
    
    // Generate answer using retrieved context
    const answer = await generateAnswer(userMessage, retrievedChunks);
    
    return answer;
  } catch (error) {
    console.error('[RAG QA Handler] Error:', error.message);
    
    if (error.message.includes('No documents')) {
      return "I don't have any uploaded documents yet. Please upload a PDF expense statement first.";
    }
    
    throw error;
  }
};
