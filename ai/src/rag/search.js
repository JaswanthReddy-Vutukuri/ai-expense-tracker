/**
 * SIMILARITY SEARCH ENGINE
 * 
 * Purpose:
 * - Performs vector similarity search over document chunks
 * - Implements cosine similarity computation
 * - Returns top-k most relevant chunks for queries
 * 
 * Why it exists:
 * - Core retrieval mechanism for RAG pipeline
 * - Enables semantic search over documents
 * - Provides ranked results by relevance
 * 
 * Architecture fit:
 * - Used by RAG QA handler to retrieve context
 * - Uses vector store for data access
 * - Uses embeddings module for query vectorization
 */

import { getAllChunks } from './vectorStore.js';
import { generateEmbedding } from './embeddings.js';

/**
 * Computes cosine similarity between two vectors
 * @param {Array<number>} vecA - First vector
 * @param {Array<number>} vecB - Second vector
 * @returns {number} Similarity score between -1 and 1
 */
export const cosineSimilarity = (vecA, vecB) => {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have same dimension');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
};

/**
 * Searches for similar chunks using cosine similarity
 * 
 * AUDIT FIX: Part 6 - User Isolation in Search
 * Now requires userId to filter search scope to user's documents only
 * 
 * @param {string} queryText - Search query
 * @param {number} userId - User ID to scope search (REQUIRED for isolation)
 * @param {number} topK - Number of results to return (default: 5)
 * @param {Object} options - Search options
 * @param {number} options.minSimilarity - Minimum similarity threshold (default: 0.3)
 * @returns {Promise<Array>} Top-k most similar chunks with scores
 */
export const searchSimilarChunks = async (queryText, userId, topK = 5, options = {}) => {
  const { minSimilarity = 0.3 } = options;
  
  // AUDIT FIX: Enforce userId for security
  // If userId is null (JWT_SECRET not configured), allow search but warn
  if (userId === undefined) {
    throw new Error('userId parameter is required for searchSimilarChunks');
  }
  
  if (userId === null) {
    console.warn('[Search] WARNING: Searching without user filtering - JWT_SECRET not configured');
  }
  
  console.log(`[Similarity Search] User ${userId} searching for: "${queryText.substring(0, 50)}..."`);
  
  // AUDIT FIX: Get only this user's chunks (not all users)
  const allChunks = getAllChunks(userId);
  
  if (allChunks.length === 0) {
    console.warn('[Similarity Search] No documents in vector store');
    return [];
  }
  
  console.log(`[Similarity Search] Searching across ${allChunks.length} chunks`);
  
  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(queryText);
  
  // Compute similarity for each chunk
  const results = allChunks.map(chunk => {
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
    return {
      text: chunk.text,
      similarity,
      chunkIndex: chunk.index,
      documentId: chunk.documentId,
      filename: chunk.filename,
      metadata: {
        startChar: chunk.startChar,
        endChar: chunk.endChar,
        length: chunk.length
      }
    };
  });
  
  // Filter by minimum similarity
  const filtered = results.filter(r => r.similarity >= minSimilarity);
  
  // Sort by similarity (descending) and take top-k
  const topResults = filtered
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
  
  // AUDIT FIX: Part 8 - Log Similarity Scores for observability
  const topScores = topResults.slice(0, 3).map(r => r.similarity.toFixed(4));
  console.log(`[Similarity Search] Found ${topResults.length} results above threshold ${minSimilarity}`);
  console.log(`[Similarity Search] Top ${topScores.length} scores: [${topScores.join(', ')}]`);
  
  if (topResults.length > 0) {
    console.log(`[Similarity Search] Best match: ${topResults[0].similarity.toFixed(4)} from "${topResults[0].filename}"`);
  }
  
  return topResults;
};

/**
 * Searches for chunks from a specific document
 * @param {string} queryText - Search query
 * @param {string} documentId - Document ID to search within
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array>} Top-k results from specified document
 */
export const searchInDocument = async (queryText, documentId, topK = 5) => {
  console.log(`[Similarity Search] Searching in document: ${documentId}`);
  
  const allChunks = getAllChunks();
  const documentChunks = allChunks.filter(chunk => chunk.documentId === documentId);
  
  if (documentChunks.length === 0) {
    console.warn(`[Similarity Search] Document ${documentId} not found or has no chunks`);
    return [];
  }
  
  const queryEmbedding = await generateEmbedding(queryText);
  
  const results = documentChunks.map(chunk => ({
    text: chunk.text,
    similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
    chunkIndex: chunk.index,
    documentId: chunk.documentId,
    filename: chunk.filename
  }));
  
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
};

/**
 * Performs hybrid search combining semantic and keyword matching
 * @param {string} queryText - Search query
 * @param {number} topK - Number of results
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Ranked results
 */
export const hybridSearch = async (queryText, topK = 5, options = {}) => {
  const { keywordWeight = 0.3, semanticWeight = 0.7 } = options;
  
  console.log(`[Hybrid Search] Query: "${queryText.substring(0, 50)}..."`);
  
  const allChunks = getAllChunks();
  
  if (allChunks.length === 0) {
    return [];
  }
  
  // Semantic search
  const queryEmbedding = await generateEmbedding(queryText);
  
  // Normalize query for keyword matching
  const queryKeywords = queryText.toLowerCase().split(/\s+/);
  
  const results = allChunks.map(chunk => {
    // Semantic similarity
    const semanticScore = cosineSimilarity(queryEmbedding, chunk.embedding);
    
    // Keyword matching score
    const chunkLower = chunk.text.toLowerCase();
    const keywordMatches = queryKeywords.filter(kw => chunkLower.includes(kw)).length;
    const keywordScore = keywordMatches / queryKeywords.length;
    
    // Combined score
    const combinedScore = (semanticWeight * semanticScore) + (keywordWeight * keywordScore);
    
    return {
      text: chunk.text,
      similarity: combinedScore,
      semanticScore,
      keywordScore,
      chunkIndex: chunk.index,
      documentId: chunk.documentId,
      filename: chunk.filename
    };
  });
  
  const topResults = results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
  
  console.log(`[Hybrid Search] Top result: combined=${topResults[0]?.similarity.toFixed(4)}, semantic=${topResults[0]?.semanticScore.toFixed(4)}, keyword=${topResults[0]?.keywordScore.toFixed(4)}`);
  
  return topResults;
};

/**
 * Finds duplicate or near-duplicate chunks
 * @param {number} threshold - Similarity threshold for duplicates (default: 0.95)
 * @returns {Array} Groups of similar chunks
 */
export const findDuplicateChunks = (threshold = 0.95) => {
  const allChunks = getAllChunks();
  const duplicateGroups = [];
  const processed = new Set();
  
  for (let i = 0; i < allChunks.length; i++) {
    if (processed.has(i)) continue;
    
    const group = [i];
    
    for (let j = i + 1; j < allChunks.length; j++) {
      if (processed.has(j)) continue;
      
      const similarity = cosineSimilarity(
        allChunks[i].embedding,
        allChunks[j].embedding
      );
      
      if (similarity >= threshold) {
        group.push(j);
        processed.add(j);
      }
    }
    
    if (group.length > 1) {
      duplicateGroups.push(group.map(idx => ({
        chunkIndex: allChunks[idx].index,
        documentId: allChunks[idx].documentId,
        text: allChunks[idx].text.substring(0, 100)
      })));
    }
    
    processed.add(i);
  }
  
  return duplicateGroups;
};
