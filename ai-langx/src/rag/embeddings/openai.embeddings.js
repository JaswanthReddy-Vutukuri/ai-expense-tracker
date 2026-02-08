/**
 * OPENAI EMBEDDINGS - LangChain Integration
 * 
 * PURPOSE:
 * - Generate vector embeddings for text chunks
 * - Uses OpenAI's text-embedding-ada-002 model
 * - Integrates with LangChain vector stores
 * 
 * LANGCHAIN CONCEPTS:
 * ✅ OpenAIEmbeddings class
 * ✅ Batch processing
 * ✅ Automatic retry logic
 * ✅ Timeout configuration
 * 
 * COMPARE WITH: ai/src/rag/embeddings.js
 */

import { OpenAIEmbeddings } from "@langchain/openai";
import { EMBEDDING_CONFIG } from '../../config/llm.config.js';

/**
 * Create configured OpenAI embeddings instance
 * 
 * LANGCHAIN BENEFIT:
 * - Automatic batching for efficiency
 * - Built-in retry logic
 * - Timeout handling
 * - Compatible with all LangChain vector stores
 * 
 * @returns {OpenAIEmbeddings} Configured embeddings instance
 */
export const createEmbeddings = () => {
  return new OpenAIEmbeddings({
    modelName: EMBEDDING_CONFIG.MODEL,
    openAIApiKey: process.env.OPENAI_API_KEY,
    timeout: EMBEDDING_CONFIG.TIMEOUT,
    // Batch size for efficiency (up to 2048 for ada-002)
    batchSize: 512,
    // Strip newlines (recommended for embeddings)
    stripNewLines: true
  });
};

/**
 * Generate embedding for single text
 * 
 * USE CASE:
 * - Query embeddings (for similarity search)
 * - Single document embedding
 * 
 * @param {string} text - Text to embed
 * @returns {Promise<Array<number>>} Embedding vector (1536 dimensions for ada-002)
 */
export const generateEmbedding = async (text) => {
  try {
    console.log('[Embeddings] Generating embedding for text:', text.substring(0, 50) + '...');
    
    const embeddings = createEmbeddings();
    const vector = await embeddings.embedQuery(text);
    
    console.log('[Embeddings] Generated vector of dimension:', vector.length);
    
    return vector;
    
  } catch (error) {
    console.error('[Embeddings] Error:', error.message);
    
    // Guard against undefined error.message
    const errorMsg = error?.message || String(error) || 'Unknown error';
    
    // Classify errors
    if (errorMsg.includes('timeout')) {
      throw new Error('Embedding generation timed out. Please try again.');
    }
    
    if (errorMsg.includes('rate limit')) {
      throw new Error('Rate limit exceeded. Please wait a moment.');
    }
    
    throw new Error(`Failed to generate embedding: ${errorMsg}`);
  }
};

/**
 * Generate embeddings for multiple texts
 * 
 * LANGCHAIN AUTO-BATCHING:
 * Automatically splits into batches of 512 (configurable)
 * and processes efficiently
 * 
 * @param {Array<string>} texts - Array of texts to embed
 * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
 */
export const generateEmbeddings = async (texts) => {
  try {
    console.log('[Embeddings] Generating embeddings for', texts.length, 'texts');
    
    const embeddings = createEmbeddings();
    
    // LangChain automatically batches this for efficiency
    const vectors = await embeddings.embedDocuments(texts);
    
    console.log('[Embeddings] Generated', vectors.length, 'vectors');
    
    return vectors;
    
  } catch (error) {
    console.error('[Embeddings] Batch error:', error.message);
    throw new Error(`Failed to generate embeddings: ${error.message}`);
  }
};

/**
 * Embed LangChain documents
 * Convenience method that extracts pageContent
 * 
 * @param {Array<Document>} documents - LangChain documents
 * @returns {Promise<Array<Array<number>>>} Embedding vectors
 */
export const embedDocuments = async (documents) => {
  const texts = documents.map(doc => doc.pageContent);
  return await generateEmbeddings(texts);
};

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * Custom (ai/src/rag/embeddings.js):
 * ```javascript
 * // Manual OpenAI SDK calls
 * const response = await openai.embeddings.create({
 *   model: 'text-embedding-ada-002',
 *   input: texts
 * });
 * return response.data.map(d => d.embedding);
 * ```
 * 
 * LangChain (this file):
 * ```javascript
 * const embeddings = new OpenAIEmbeddings();
 * const vectors = await embeddings.embedDocuments(texts);
 * ```
 * 
 * ADVANTAGES OF LANGCHAIN:
 * ✅ Automatic batching (no manual chunking)
 * ✅ Built-in retry logic
 * ✅ Timeout handling
 * ✅ Works with any LangChain vector store
 * ✅ Easy to swap providers (OpenAI → Cohere → HuggingFace)
 * ✅ Cleaner API (embedQuery vs embedDocuments)
 * 
 * WHEN TO USE CUSTOM:
 * ❌ Need custom batching logic
 * ❌ Want to cache at HTTP level
 * ❌ Implementing custom retry with backoff
 * ❌ Need raw response metadata
 * 
 * LEARNING NOTE - PROVIDER SWAPPING:
 * 
 * To switch from OpenAI to Cohere:
 * ```javascript
 * import { CohereEmbeddings } from "@langchain/cohere";
 * const embeddings = new CohereEmbeddings({
 *   apiKey: process.env.COHERE_API_KEY
 * });
 * ```
 * 
 * To use HuggingFace:
 * ```javascript
 * import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
 * const embeddings = new HuggingFaceInferenceEmbeddings({
 *   apiKey: process.env.HUGGINGFACE_API_KEY
 * });
 * ```
 * 
 * All have the same interface: embedQuery() and embedDocuments()
 * This is a huge win for flexibility!
 */
