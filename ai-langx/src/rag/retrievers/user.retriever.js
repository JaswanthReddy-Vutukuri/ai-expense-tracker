/**
 * RAG RETRIEVER - LangChain Vector Store Retriever
 * 
 * PURPOSE:
 * - Wrap vector store with retriever interface
 * - Add filtering and scoring logic
 * - Integrate with RAG chains
 * 
 * LANGCHAIN CONCEPTS:
 * ✅ VectorStoreRetriever
 * ✅ Search parameters (k, filter, threshold)
 * ✅ Chain integration
 * 
 * COMPARE WITH: Custom search in ai/src/rag/search.js
 */

import { getVectorStore, similaritySearch } from '../vectorstore/memory.store.js';

/**
 * Create retriever with user filtering
 * 
 * LANGCHAIN PATTERN:
 * Retrievers are used by RAG chains to fetch relevant context
 * They provide a consistent interface for different retrieval methods
 * 
 * @param {number} userId - User ID for filtering
 * @param {number} k - Number of documents to retrieve
 * @returns {Promise<Object>} Retriever with getRelevantDocuments method
 */
export const createUserRetriever = async (userId, k = 5) => {
  const store = await getVectorStore();
  
  // MemoryVectorStore requires filter as FUNCTION, not object
  // Production vector DBs (Pinecone, Chroma) use object filters
  const filterFunc = (doc) => {
    return doc && doc.metadata && doc.metadata.userId === userId;
  };
  
  // Create retriever from vector store
  const retriever = store.asRetriever({
    k,
    filter: filterFunc,
    searchType: "similarity",
    verbose: true
  });
  
  return retriever;
};

/**
 * Retrieve relevant documents for query
 * 
 * This is the main function used by RAG workflows
 * 
 * @param {string} query - User query
 * @param {number} userId - User ID for filtering
 * @param {number} k - Number of results
 * @returns {Promise<Array<Document>>} Relevant documents
 */
export const retrieveDocuments = async (query, userId, k = 5) => {
  try {
    console.log('[Retriever] Fetching documents for query:', query.substring(0, 50));
    console.log('[Retriever] User ID:', userId, 'k:', k);
    
    // Use similarity search with user filter
    const documents = await similaritySearch(query, k, { userId });
    
    console.log('[Retriever] Retrieved', documents.length, 'documents');
    
    // Log similarity scores for debugging
    documents.forEach((doc, idx) => {
      console.log(`[Retriever] Doc ${idx + 1} score:`, doc.metadata?.similarityScore?.toFixed(4));
    });
    
    return documents;
    
  } catch (error) {
    console.error('[Retriever] Error:', error.message);
    throw new Error(`Failed to retrieve documents: ${error.message}`);
  }
};

/**
 * Retrieve with score threshold
 * Only return documents above similarity threshold
 * 
 * @param {string} query - User query
 * @param {number} userId - User ID
 * @param {number} threshold - Minimum similarity score (0-1)
 * @param {number} k - Max results
 * @returns {Promise<Array<Document>>} Filtered documents
 */
export const retrieveWithThreshold = async (query, userId, threshold = 0.7, k = 5) => {
  try {
    const documents = await retrieveDocuments(query, userId, k);
    
    // Filter by score
    const filtered = documents.filter(doc => {
      const score = doc.metadata?.similarityScore || 0;
      return score >= threshold;
    });
    
    console.log('[Retriever] Filtered to', filtered.length, 'documents above threshold', threshold);
    
    return filtered;
    
  } catch (error) {
    console.error('[Retriever] Threshold filter error:', error.message);
    throw error;
  }
};

/**
 * Format retrieved documents for LLM context
 * 
 * @param {Array<Document>} documents - Retrieved documents
 * @returns {string} Formatted context string
 */
export const formatDocumentsForContext = (documents) => {
  if (!documents || documents.length === 0) {
    return "No relevant documents found.";
  }
  
  return documents
    .map((doc, idx) => {
      const source = doc.metadata?.source || 'unknown';
      const chunkIndex = doc.metadata?.chunkIndex !== undefined 
        ? ` (chunk ${doc.metadata.chunkIndex + 1})` 
        : '';
      
      return `[Source ${idx + 1}: ${source}${chunkIndex}]\n${doc.pageContent}`;
    })
    .join('\n\n---\n\n');
};

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * Custom (ai/src/rag/search.js):
 * ```javascript
 * export const searchSimilarChunks = async (query, userId, topK = 5) => {
 *   // 1. Generate query embedding
 *   const queryEmbedding = await generateEmbedding(query);
 *   
 *   // 2. Get all chunks
 *   const allChunks = await getAllChunks(userId);
 *   
 *   // 3. Calculate similarities
 *   const scored = allChunks.map(chunk => ({
 *     ...chunk,
 *     score: cosineSimilarity(queryEmbedding, chunk.embedding)
 *   }));
 *   
 *   // 4. Sort and return top K
 *   return scored.sort((a,b) => b.score - a.score).slice(0, topK);
 * };
 * ```
 * 
 * LangChain (this file):
 * ```javascript
 * const retriever = await createUserRetriever(userId, k);
 * const docs = await retriever.getRelevantDocuments(query);
 * ```
 * 
 * Or even simpler:
 * ```javascript
 * const docs = await retrieveDocuments(query, userId, k);
 * ```
 * 
 * ADVANTAGES OF LANGCHAIN:
 * ✅ All steps automatic (embed, search, rank)
 * ✅ Optimized search algorithms
 * ✅ Consistent interface for chains
 * ✅ Easy to add reranking, MMR, etc.
 * ✅ ~50 LOC vs ~150 LOC custom
 * 
 * ADVANCED RETRIEVAL STRATEGIES:
 * 
 * 1. MMR (Maximal Marginal Relevance) - Diverse results:
 * ```javascript
 * const retriever = store.asRetriever({
 *   searchType: "mmr",
 *   k: 5,
 *   fetchK: 20  // Fetch 20, return diverse 5
 * });
 * ```
 * 
 * 2. Hybrid search (vector + keyword):
 * - Use with vector DBs that support it (Weaviate, Pinecone)
 * 
 * 3. Reranking with cross-encoder:
 * ```javascript
 * import { CohereRerank } from "@langchain/cohere";
 * const reranker = new CohereRerank();
 * const reranked = await reranker.rerank(docs, query);
 * ```
 * 
 * 4. Parent document retriever:
 * - Retrieve small chunks but return larger parent docs
 * ```javascript
 * import { ParentDocumentRetriever } from "langchain/retrievers/parent_document";
 * ```
 * 
 * LangChain makes it easy to experiment with these strategies!
 */
