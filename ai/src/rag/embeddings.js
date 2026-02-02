/**
 * EMBEDDINGS GENERATOR
 * 
 * Purpose:
 * - Generates vector embeddings for text chunks
 * - Uses OpenAI's text-embedding-ada-002 model
 * - Handles batch processing for efficiency
 * 
 * Why it exists:
 * - Converts text to numerical vectors for similarity search
 * - Centralizes embedding generation logic
 * - Provides retry logic and error handling
 * 
 * Architecture fit:
 * - Used by upload route after chunking
 * - Used by search module for query embeddings
 * - Output stored in vector database
 */

import OpenAI from 'openai';

// Use direct HTTP calls if USE_FETCH_FOR_EMBEDDINGS is set (better timeout control)
const USE_FETCH_FOR_EMBEDDINGS = process.env.USE_FETCH_FOR_EMBEDDINGS === 'true';

const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY || process.env.LLM_API_KEY,
  timeout: 15000, // 15 second timeout at SDK level
  maxRetries: 0 // Disable retries to prevent hanging
};
if (process.env.EMBEDDING_BASE_URL) {
  openaiConfig.baseURL = process.env.EMBEDDING_BASE_URL;
  console.warn('[Embeddings] Using custom baseURL:', process.env.EMBEDDING_BASE_URL);
}
const openai = new OpenAI(openaiConfig);

console.log('[Embeddings] OpenAI client initialized with timeout:', openaiConfig.timeout);
console.log('[Embeddings] Using fetch API:', USE_FETCH_FOR_EMBEDDINGS);

/**
 * Call OpenAI embeddings API directly with fetch (better timeout control)
 */
async function callEmbeddingAPIWithFetch(input, timeoutMs = 15000) {
  const baseURL = process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002';
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(`${baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, input }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`OpenAI API error (${response.status}): ${error.error?.message || response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`Embedding API timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Generates embeddings for a single text
 * @param {string} text - Text to embed
 * @returns {Promise<Array<number>>} Embedding vector
 */
export const generateEmbedding = async (text) => {
  // Validate configuration before attempting API call
  if (!process.env.LLM_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error('No API key configured. Set LLM_API_KEY or OPENAI_API_KEY in .env file');
  }
  
  if (process.env.EMBEDDING_BASE_URL) {
    console.warn('[Embeddings] WARNING: EMBEDDING_BASE_URL is set. If this endpoint is unavailable, remove it from .env');
  }
  
  try {
    console.log(`[Embeddings] Generating embedding for text (${text.length} chars)`);
    console.log(`[Embeddings] API Key present: ${!!(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY)}`);
    console.log(`[Embeddings] BaseURL: ${process.env.EMBEDDING_BASE_URL || 'default'}`);
    console.log(`[Embeddings] Model: ${process.env.EMBEDDING_MODEL || 'text-embedding-ada-002'}`);
    
    let response;
    
    // Use fetch API if enabled (better timeout control)
    if (USE_FETCH_FOR_EMBEDDINGS) {
      console.log(`[Embeddings] Using fetch API for embedding generation`);
      response = await callEmbeddingAPIWithFetch(text.substring(0, 8000));
    } else {
      // Use OpenAI SDK with Promise.race timeout
      response = await Promise.race([
        openai.embeddings.create({
          model: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',
          input: text.substring(0, 8000) // OpenAI limit is ~8k tokens
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Embedding API timeout after 30 seconds')), 30000)
        )
      ]);
    }
    
    console.log(`[Embeddings] Successfully generated embedding (${response.data[0].embedding.length} dimensions)`);
    return response.data[0].embedding;
  } catch (error) {
    console.error('[Embeddings] Error generating embedding:', error.message);
    
    if (error.message.includes('timeout')) {
      throw new Error('Embedding API timeout. Check: 1) Valid OpenAI API key 2) Remove EMBEDDING_BASE_URL from .env if custom endpoint is down');
    }
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      throw new Error(`Embedding service unavailable (${error.code}). Remove EMBEDDING_BASE_URL from .env to use standard OpenAI.`);
    }
    
    if (error.status === 401) {
      throw new Error('Invalid OpenAI API key. Please check LLM_API_KEY in .env file');
    }
    
    throw new Error(`Embedding generation failed: ${error.message}`);
  }
};

/**
 * Generates embeddings for multiple texts in batch
 * More efficient than individual calls
 * @param {Array<string>} texts - Array of texts to embed
 * @param {Object} options - Configuration options
 * @param {number} options.batchSize - Number of texts per API call (default: 20)
 * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
 */
export const generateEmbeddings = async (texts, options = {}) => {
  const { batchSize = 20 } = options;
  
  if (!texts || texts.length === 0) {
    return [];
  }
  
  console.log(`[Embeddings] Generating embeddings for ${texts.length} texts`);
  console.log(`[Embeddings] Using model: ${process.env.EMBEDDING_MODEL || 'text-embedding-ada-002'}`);
  console.log(`[Embeddings] Using baseURL: ${process.env.EMBEDDING_BASE_URL || 'default OpenAI'}`);
  
  const allEmbeddings = [];
  
  // Process in batches to avoid rate limits
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    console.log(`[Embeddings] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`);
    
    try {
      // Use individual embedding calls (safer with fetch API approach)
      console.log(`[Embeddings] Processing ${batch.length} texts individually...`);
      for (let j = 0; j < batch.length; j++) {
        const text = batch[j];
        console.log(`[Embeddings] Embedding text ${i + j + 1}/${texts.length}`);
        const embedding = await generateEmbedding(text);
        allEmbeddings.push(embedding);
      }
      console.log(`[Embeddings] Batch complete`);
      
      // Small delay to avoid rate limiting
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`[Embeddings] Error in batch ${i}-${i + batchSize}:`, error.message);
      
      if (error.message.includes('timeout') || error.code === 'ECONNREFUSED') {
        throw new Error('Embedding service unavailable. Please check your .env file - remove EMBEDDING_BASE_URL if the custom endpoint is down, or add a valid OpenAI API key.');
      }
      
      // Retry with smaller batch or skip
      if (batch.length === 1) {
        // Single item failed, use zero vector as fallback
        console.warn('[Embeddings] Using zero vector for failed embedding');
        allEmbeddings.push(new Array(1536).fill(0)); // Ada-002 is 1536 dimensions
      } else {
        // Retry batch items individually
        console.log('[Embeddings] Retrying batch items individually');
        for (const text of batch) {
          try {
            const embedding = await generateEmbedding(text);
            allEmbeddings.push(embedding);
          } catch (retryError) {
            console.error('[Embeddings] Individual retry failed:', retryError.message);
            allEmbeddings.push(new Array(1536).fill(0));
          }
        }
      }
    }
  }
  
  console.log(`[Embeddings] Generated ${allEmbeddings.length} embeddings`);
  
  return allEmbeddings;
};

/**
 * Validates embedding vector
 * @param {Array<number>} embedding - Embedding vector to validate
 * @returns {boolean} True if valid
 */
export const isValidEmbedding = (embedding) => {
  if (!Array.isArray(embedding)) {
    return false;
  }
  
  // OpenAI ada-002 produces 1536-dimensional vectors
  if (embedding.length !== 1536) {
    return false;
  }
  
  // Check if all values are numbers
  return embedding.every(val => typeof val === 'number' && !isNaN(val));
};

/**
 * Gets embedding dimension size
 * @returns {number} Dimension size (1536 for ada-002)
 */
export const getEmbeddingDimension = () => 1536;
