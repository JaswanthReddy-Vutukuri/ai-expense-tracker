/**
 * RAG QA CHAIN - LangChain RetrievalQA
 * 
 * PURPOSE:
 * - Answer questions using retrieved documents
 * - Combine retrieval + generation (RAG)
 * - Handle context window management
 * 
 * LANGCHAIN CONCEPTS:
 * ✅ RetrievalQAChain
 * ✅ Prompt templates for RAG
 * ✅ Source attribution
 * ✅ Streaming support
 * 
 * COMPARE WITH: ai/src/handlers/ragQaHandler.js
 */

import { RetrievalQAChain } from "langchain/chains";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { getVectorStore } from '../vectorstore/memory.store.js';
import { retrieveDocuments, formatDocumentsForContext } from '../retrievers/user.retriever.js';

/**
 * Create QA chain for PDF question answering
 * 
 * LANGCHAIN MAGIC:
 * RetrievalQAChain automatically:
 * 1. Takes user query
 * 2. Retrieves relevant docs
 * 3. Formats context
 * 4. Prompts LLM
 * 5. Returns answer with sources
 * 
 * @param {number} userId - User ID for filtering
 * @param {Object} options - Configuration
 * @returns {Promise<RetrievalQAChain>} QA chain
 */
export const createQAChain = async (userId, options = {}) => {
  const {
    modelName = "gpt-4o-mini",
    temperature = 0,  // Low temperature for factual answers
    k = 5,  // Number of docs to retrieve
    returnSourceDocuments = true
  } = options;
  
  try {
    // Get vector store and create retriever
    const vectorStore = await getVectorStore();
    
    // MemoryVectorStore requires filter as FUNCTION, not object
    // Production vector DBs (Pinecone, Chroma) use object filters
    const filterFunc = (doc) => {
      return doc && doc.metadata && doc.metadata.userId === userId;
    };
    
    const retriever = vectorStore.asRetriever({
      k,
      filter: filterFunc,
      searchType: "similarity"
    });
    
    // Create LLM
    const llm = new ChatOpenAI({
      modelName,
      temperature,
      openAIApiKey: process.env.OPENAI_API_KEY
    });
    
    // Custom prompt for RAG
    const qaPrompt = PromptTemplate.fromTemplate(`
You are an AI assistant answering questions about uploaded PDF documents.

Use the following context from the user's documents to answer the question.
If the answer is not in the context, say "I don't have enough information in your uploaded documents to answer this question."

Context:
{context}

Question: {question}

Instructions:
- Answer based ONLY on the provided context
- Be specific and cite relevant details
- If you're not sure, say so
- Keep answers concise but complete

Answer:`);
    
    // Create chain
    const chain = RetrievalQAChain.fromLLM(llm, retriever, {
      prompt: qaPrompt,
      returnSourceDocuments,
      verbose: true
    });
    
    console.log('[QA Chain] Created for user', userId);
    
    return chain;
    
  } catch (error) {
    console.error('[QA Chain] Creation error:', error.message);
    throw new Error(`Failed to create QA chain: ${error.message}`);
  }
};

/**
 * Answer question using RAG
 * 
 * Simpler interface than creating chain directly
 * 
 * @param {string} question - User question
 * @param {number} userId - User ID
 * @param {Object} options - Configuration
 * @returns {Promise<Object>} Answer with sources
 */
export const answerQuestion = async (question, userId, options = {}) => {
  try {
    console.log('[QA] Question:', question);
    console.log('[QA] User ID:', userId);
    
    const chain = await createQAChain(userId, options);
    
    // Run chain
    const result = await chain.call({
      query: question
    });
    
    console.log('[QA] Generated answer');
    console.log('[QA] Source documents:', result.sourceDocuments?.length || 0);
    
    // Format response
    return {
      answer: result.text,
      sources: result.sourceDocuments?.map(doc => ({
        filename: doc.metadata?.filename || 'unknown',
        page: doc.metadata?.loc?.pageNumber || doc.metadata?.page,
        chunkIndex: doc.metadata?.chunkIndex,
        snippet: doc.pageContent.substring(0, 200) + '...',
        similarity: doc.metadata?.similarityScore
      })) || [],
      confidence: calculateConfidence(result.sourceDocuments)
    };
    
  } catch (error) {
    console.error('[QA] Error:', error.message);
    throw new Error(`Failed to answer question: ${error.message}`);
  }
};

/**
 * Answer with streaming
 * Real-time answer generation
 * 
 * @param {string} question - User question
 * @param {number} userId - User ID
 * @param {Function} onToken - Callback for each token
 * @returns {Promise<Object>} Complete answer
 */
export const answerQuestionStreaming = async (question, userId, onToken) => {
  try {
    console.log('[QA Streaming] Starting for:', question);
    
    // First retrieve documents
    const docs = await retrieveDocuments(question, userId, 5);
    
    if (docs.length === 0) {
      const message = "I don't have any uploaded documents to answer your question.";
      onToken(message);
      return { answer: message, sources: [] };
    }
    
    // Format context
    const context = formatDocumentsForContext(docs);
    
    // Create streaming LLM
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
      streaming: true,
      callbacks: [{
        handleLLMNewToken(token) {
          onToken(token);
        }
      }]
    });
    
    // Create prompt
    const prompt = `You are an AI assistant answering questions about uploaded PDF documents.

Use the following context from the user's documents to answer the question.
If the answer is not in the context, say "I don't have enough information in your uploaded documents to answer this question."

Context:
${context}

Question: ${question}

Instructions:
- Answer based ONLY on the provided context
- Be specific and cite relevant details
- If you're not sure, say so
- Keep answers concise but complete

Answer:`;
    
    // Stream response
    let fullAnswer = '';
    const response = await llm.call(prompt);
    fullAnswer = response.content;
    
    console.log('[QA Streaming] Complete');
    
    return {
      answer: fullAnswer,
      sources: docs.map(doc => ({
        filename: doc.metadata?.filename || 'unknown',
        page: doc.metadata?.loc?.pageNumber || doc.metadata?.page,
        chunkIndex: doc.metadata?.chunkIndex,
        snippet: doc.pageContent.substring(0, 200) + '...'
      }))
    };
    
  } catch (error) {
    console.error('[QA Streaming] Error:', error.message);
    throw error;
  }
};

/**
 * Multi-query RAG
 * Generate multiple perspectives on the question
 * 
 * ADVANCED PATTERN:
 * Generate 3 variations of the query, retrieve for each, combine results
 * Improves recall for ambiguous questions
 * 
 * @param {string} question - Original question
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Enhanced answer
 */
export const answerWithMultiQuery = async (question, userId) => {
  try {
    console.log('[Multi-Query QA] Original:', question);
    
    // Use LLM to generate query variations
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.7
    });
    
    const variations = await llm.call(
      `Generate 2 alternative phrasings of this question (return only the questions, one per line):
      
"${question}"`
    );
    
    const queries = [
      question,
      ...variations.content.split('\n').filter(q => q.trim())
    ].slice(0, 3);
    
    console.log('[Multi-Query QA] Queries:', queries);
    
    // Retrieve for each query
    const allDocs = [];
    const seenChunks = new Set();
    
    for (const query of queries) {
      const docs = await retrieveDocuments(query, userId, 3);
      docs.forEach(doc => {
        const chunkId = `${doc.metadata?.filename}-${doc.metadata?.chunkIndex}`;
        if (!seenChunks.has(chunkId)) {
          seenChunks.add(chunkId);
          allDocs.push(doc);
        }
      });
    }
    
    console.log('[Multi-Query QA] Retrieved', allDocs.length, 'unique docs');
    
    // Answer with combined context
    const context = formatDocumentsForContext(allDocs);
    
    const answer = await llm.call(`Using this context, answer the question:

Context:
${context}

Question: ${question}

Answer:`);
    
    return {
      answer: answer.content,
      sources: allDocs.map(doc => ({
        filename: doc.metadata?.filename || 'unknown',
        snippet: doc.pageContent.substring(0, 200) + '...'
      })),
      queriesUsed: queries
    };
    
  } catch (error) {
    console.error('[Multi-Query QA] Error:', error.message);
    throw error;
  }
};

/**
 * Calculate confidence score based on source documents
 * 
 * @param {Array<Document>} docs - Source documents
 * @returns {string} Confidence level
 */
const calculateConfidence = (docs) => {
  if (!docs || docs.length === 0) return 'none';
  
  const avgScore = docs.reduce((sum, doc) => {
    return sum + (doc.metadata?.similarityScore || 0);
  }, 0) / docs.length;
  
  if (avgScore >= 0.8) return 'high';
  if (avgScore >= 0.6) return 'medium';
  return 'low';
};

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * Custom (ai/src/handlers/ragQaHandler.js):
 * ```javascript
 * export const handleRAGQuestion = async (question, userId) => {
 *   // 1. Manual retrieval
 *   const chunks = await searchSimilarChunks(question, userId, 5);
 *   
 *   // 2. Manual context formatting
 *   const context = chunks.map(c => c.text).join('\n\n');
 *   
 *   // 3. Manual prompt construction
 *   const prompt = `Context: ${context}\n\nQuestion: ${question}\n\nAnswer:`;
 *   
 *   // 4. Manual LLM call
 *   const response = await openai.chat.completions.create({
 *     model: 'gpt-4o-mini',
 *     messages: [{ role: 'user', content: prompt }]
 *   });
 *   
 *   // 5. Manual response formatting
 *   return {
 *     answer: response.choices[0].message.content,
 *     sources: chunks.map(c => ({ filename: c.filename }))
 *   };
 * };
 * ```
 * 
 * LangChain (this file):
 * ```javascript
 * const chain = await createQAChain(userId);
 * const result = await chain.call({ query: question });
 * ```
 * 
 * Or even simpler:
 * ```javascript
 * const result = await answerQuestion(question, userId);
 * ```
 * 
 * ADVANTAGES OF LANGCHAIN:
 * ✅ Auto retrieval + generation pipeline
 * ✅ Optimized prompt templates
 * ✅ Source attribution built-in
 * ✅ Streaming support
 * ✅ Context window management (auto-truncate)
 * ✅ Easy to add multi-query, reranking, etc.
 * ✅ ~150 LOC vs ~300 LOC custom
 * 
 * ADVANCED RAG PATTERNS AVAILABLE:
 * 
 * 1. ConversationalRetrievalQA (chat history):
 * ```javascript
 * import { ConversationalRetrievalQAChain } from "langchain/chains";
 * const chain = ConversationalRetrievalQAChain.fromLLM(llm, retriever);
 * const result = await chain.call({
 *   question,
 *   chat_history: previousMessages
 * });
 * ```
 * 
 * 2. MapReduceDocumentsChain (long documents):
 * - Process each doc separately, then combine
 * ```javascript
 * chain: "map_reduce"
 * ```
 * 
 * 3. RefineDocumentsChain (iterative refinement):
 * - Start with first doc, refine with each subsequent doc
 * ```javascript
 * chain: "refine"
 * ```
 * 
 * 4. HyDE (Hypothetical Document Embeddings):
 * - Generate hypothetical answer, embed it, retrieve similar
 * ```javascript
 * import { HydeRetriever } from "langchain/retrievers/hyde";
 * ```
 * 
 * LangChain makes these patterns plug-and-play!
 */
