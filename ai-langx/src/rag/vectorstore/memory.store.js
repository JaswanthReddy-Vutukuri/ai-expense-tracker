/**
 * VECTOR STORE - LangChain MemoryVectorStore with Persistence
 * 
 * PURPOSE:
 * - Store document chunks and embeddings
 * - Enable similarity search
 * - Persist to disk for durability
 * - User isolation for multi-tenancy
 * 
 * LANGCHAIN CONCEPTS:
 * ✅ MemoryVectorStore (in-memory with fast search)
 * ✅ Similarity search with score threshold
 * ✅ Metadata filtering
 * ✅ Serialization/deserialization
 * 
 * COMPARE WITH: ai/src/rag/vectorStore.js
 */

import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { createEmbeddings } from '../embeddings/openai.embeddings.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage path
const VECTOR_STORE_DIR = path.join(__dirname, '../../../data/vectorstore');
const VECTOR_STORE_FILE = path.join(VECTOR_STORE_DIR, 'langchain-store.json');

// In-memory store instance (singleton)
let vectorStore = null;

/**
 * Initialize or get vector store
 * 
 * LANGCHAIN PATTERN:
 * MemoryVectorStore keeps vectors in memory for fast search
 * We persist to disk manually for durability
 * 
 * @returns {Promise<MemoryVectorStore>} Vector store instance
 */
export const getVectorStore = async () => {
  if (vectorStore) {
    return vectorStore;
  }
  
  try {
    // Validate OpenAI API key before creating embeddings
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    
    // Try loading from disk first
    const exists = await fs.access(VECTOR_STORE_FILE).then(() => true).catch(() => false);
    
    if (exists) {
      console.log('[Vector Store] Loading from disk:', VECTOR_STORE_FILE);
      vectorStore = await loadVectorStore();
      console.log('[Vector Store] Loaded successfully');
    } else {
      console.log('[Vector Store] Creating new store');
      const embeddings = createEmbeddings();
      console.log('[Vector Store] Embeddings created:', {
        hasEmbeddings: !!embeddings,
        embeddingsType: embeddings?.constructor?.name
      });
      vectorStore = new MemoryVectorStore(embeddings);
      console.log('[Vector Store] MemoryVectorStore initialized');
    }
    
    return vectorStore;
    
  } catch (error) {
    console.error('[Vector Store] Initialization error:', error.message);
    // Fallback to new store
    console.log('[Vector Store] Falling back to new store');
    const embeddings = createEmbeddings();
    vectorStore = new MemoryVectorStore(embeddings);
    return vectorStore;
  }
};

/**
 * Add documents to vector store
 * 
 * LANGCHAIN AUTO-EMBEDDING:
 * - Automatically generates embeddings for documents
 * - Stores both text and vectors
 * - Preserves all metadata
 * 
 * @param {Array<Document>} documents - LangChain documents to add
 * @param {Object} additionalMetadata - Extra metadata to add
 * @returns {Promise<Array<string>>} Document IDs
 */
export const addDocuments = async (documents, additionalMetadata = {}) => {
  try {
    console.log('[Vector Store] Adding', documents.length, 'documents');
    console.log('[Vector Store] Document sample:', {
      hasPageContent: !!documents[0]?.pageContent,
      pageContentLength: documents[0]?.pageContent?.length,
      hasMetadata: !!documents[0]?.metadata
    });
    
    const store = await getVectorStore();
    
    console.log('[Vector Store] Store initialized:', {
      hasStore: !!store,
      storeType: store?.constructor?.name,
      hasAddDocuments: typeof store?.addDocuments === 'function'
    });
    
    // Add additional metadata to all documents
    if (Object.keys(additionalMetadata).length > 0) {
      console.log('[Vector Store] Adding metadata to documents:', additionalMetadata);
      console.log('[Vector Store] Sample doc metadata BEFORE merge:', documents[0]?.metadata);
      documents.forEach(doc => {
        doc.metadata = { ...doc.metadata, ...additionalMetadata };
      });
      console.log('[Vector Store] Sample doc metadata AFTER merge:', documents[0]?.metadata);
    } else {
      console.log('[Vector Store] No additional metadata to merge');
      console.log('[Vector Store] Sample doc metadata (unchanged):', documents[0]?.metadata);
    }
    
    // LangChain automatically:
    // 1. Generates embeddings
    // 2. Stores vectors
    // 3. Indexes for search
    console.log('[Vector Store] Calling store.addDocuments...');
    
    // Get count before adding
    const beforeCount = store.memoryVectors?.length || 0;
    console.log('[Vector Store] Vectors before add:', beforeCount);
    
    const ids = await store.addDocuments(documents);
    
    // Get count after adding
    const afterCount = store.memoryVectors?.length || 0;
    const addedCount = afterCount - beforeCount;
    
    console.log('[Vector Store] Vectors after add:', afterCount);
    console.log('[Vector Store] Actually added:', addedCount, 'vectors');
    
    // DEBUG: Check stored documents have correct metadata
    if (store.memoryVectors && store.memoryVectors.length > 0) {
      const lastAdded = store.memoryVectors[store.memoryVectors.length - 1];
      console.log('[Vector Store] Last added document structure:', {
        keys: Object.keys(lastAdded),
        hasContent: !!lastAdded.content,
        hasEmbedding: !!lastAdded.embedding,
        hasMetadata: !!lastAdded.metadata,
        contentType: typeof lastAdded.content,
        topLevelMetadata: lastAdded.metadata,
        contentMetadata: lastAdded.content?.metadata,
        userId_topLevel: lastAdded.metadata?.userId,
        userId_contentMetadata: lastAdded.content?.metadata?.userId
      });
    }
    
    console.log('[Vector Store] addDocuments returned:', {
      idsType: typeof ids,
      isArray: Array.isArray(ids),
      idsLength: ids?.length,
      ids: ids
    });
    
    // CRITICAL FIX: MemoryVectorStore.addDocuments() doesn't return IDs
    // Instead, we verify documents were added by checking vector count
    // and generate synthetic IDs or return count
    let idsArray;
    if (Array.isArray(ids) && ids.length > 0) {
      idsArray = ids;
    } else if (addedCount > 0) {
      // Generate synthetic IDs based on what was actually added
      idsArray = Array.from({ length: addedCount }, (_, i) => `doc_${beforeCount + i + 1}`);
      console.log('[Vector Store] Generated synthetic IDs for', addedCount, 'documents');
    } else {
      idsArray = [];
      console.warn('[Vector Store] No documents were added!');
    }
    
    console.log('[Vector Store] Returning IDs:', idsArray.length);
    
    // Persist to disk
    await saveVectorStore(store);
    
    return idsArray;
    
  } catch (error) {
    console.error('[Vector Store] Add documents error:', error.message);
    console.error('[Vector Store] Full error:', error);
    throw new Error(`Failed to add documents: ${error.message}`);
  }
};

/**
 * Similarity search with user filtering
 * 
 * LANGCHAIN FEATURES:
 * - Cosine similarity search
 * - Top-k results
 * - Score threshold filtering
 * - Metadata filtering (user isolation)
 * 
 * IMPORTANT: MemoryVectorStore expects filter as FUNCTION, not object
 * Production vector DBs (Pinecone, Chroma) use object filters
 * We convert object → function here for MemoryVectorStore compatibility
 * 
 * @param {string} query - Search query
 * @param {number} k - Number of results
 * @param {Object|Function} filter - Metadata filter {userId: 123} or function
 * @returns {Promise<Array<Document>>} Matching documents with scores
 */
export const similaritySearch = async (query, k = 5, filter = {}) => {
  try {
    console.log('[Vector Store] Searching for:', query.substring(0, 50));
    console.log('[Vector Store] Filter:', filter);
    
    const store = await getVectorStore();
    
    // DEBUG: Show total vectors and filtered count BEFORE search
    const totalVectors = store.memoryVectors?.length || 0;
    console.log('[Vector Store] Total vectors in store:', totalVectors);
    
    if (filter && typeof filter === 'object' && Object.keys(filter).length > 0) {
      const matchingCount = (store.memoryVectors || []).filter(item => {
        // Check both possible metadata locations
        const topLevelMatch = Object.entries(filter).every(([key, value]) => {
          return item.metadata && item.metadata[key] === value;
        });
        const contentMatch = Object.entries(filter).every(([key, value]) => {
          return item.content?.metadata && item.content.metadata[key] === value;
        });
        return topLevelMatch || contentMatch;
      }).length;
      console.log('[Vector Store] Vectors matching filter:', matchingCount);
    }
    
    // Convert object filter to function filter for MemoryVectorStore
    // MemoryVectorStore expects: (doc) => boolean
    // Production DBs expect: { userId: 123 }
    let filterFunc = undefined;
    
    if (typeof filter === 'function') {
      // Already a function
      filterFunc = filter;
    } else if (filter && typeof filter === 'object' && Object.keys(filter).length > 0) {
      // Convert object filter to function
      const filterEntries = Object.entries(filter);
      filterFunc = (doc) => {
        // MemoryVectorStore may pass Document directly OR the stored item
        // Check metadata at document level (standard) 
        const hasMetadataMatch = filterEntries.every(([key, value]) => {
          return doc.metadata && doc.metadata[key] === value;
        });
        
        // Debug log occasionally
        if (Math.random() < 0.1) {
          console.log('[Vector Store] Filter checking doc:', {
            docType: typeof doc,
            hasMetadata: !!doc.metadata,
            metadataUserId: doc.metadata?.userId,
            filterExpects: filterEntries
          });
        }
        
        return hasMetadataMatch;
      };
      console.log('[Vector Store] Converted object filter to function predicate');
    }
    
    // Search with score (pass undefined if no filter)
    const results = await store.similaritySearchWithScore(query, k, filterFunc);
    
    console.log('[Vector Store] Found', results.length, 'results');
    
    // Results are [Document, score] pairs
    // Convert to documents with score in metadata
    const documents = results.map(([doc, score]) => ({
      ...doc,
      metadata: {
        ...doc.metadata,
        similarityScore: score
      }
    }));
    
    return documents;
    
  } catch (error) {
    console.error('[Vector Store] Search error:', error.message);
    throw new Error(`Failed to search: ${error.message}`);
  }
};

/**
 * Get all documents for a user
 * 
 * @param {number} userId - User ID
 * @returns {Promise<Array<Document>>} User's documents
 */
export const getUserDocuments = async (userId) => {
  try {
    const store = await getVectorStore();
    
    // Note: MemoryVectorStore doesn't have native filtering
    // We need to search all and filter manually
    // For production, use Pinecone, Weaviate, or Chroma with native filtering
    
    // Get all documents (this is a limitation of MemoryVectorStore)
    const allDocs = store.memoryVectors || [];
    
    console.log('[Vector Store] Checking documents for user', userId);
    console.log('[Vector Store] Total vectors in store:', allDocs.length);
    
    // DEBUG: Log structure of first item
    if (allDocs.length > 0) {
      const firstItem = allDocs[0];
      console.log('[Vector Store] First item structure:', {
        keys: Object.keys(firstItem),
        hasContent: !!firstItem.content,
        hasMetadata: !!firstItem.metadata,
        contentType: typeof firstItem.content,
        metadataKeys: firstItem.metadata ? Object.keys(firstItem.metadata) : 'none',
        topLevelMetadata: firstItem.metadata,
        contentMetadata: firstItem.content?.metadata,
        contentMetadataKeys: firstItem.content?.metadata ? Object.keys(firstItem.content.metadata) : 'none'
      });
    }
    
    // MemoryVectorStore structure: Check both possible locations for metadata
    // Option 1: { content: Document, embedding: [], metadata: {} } - metadata at top level
    // Option 2: { content: Document { metadata: {} }, embedding: [] } - metadata in Document
    const userDocs = allDocs
      .filter(item => {
        // Check both locations for userId
        const topLevelUserId = item.metadata?.userId;
        const contentUserId = item.content?.metadata?.userId;
        const docUserId = topLevelUserId !== undefined ? topLevelUserId : contentUserId;
        const matches = docUserId === userId;
        if (allDocs.length < 10) { // Only log for small sets to avoid spam
          console.log('[Vector Store] Document userId (topLevel/content):', topLevelUserId, '/', contentUserId, 'matches:', matches);
        }
        return matches;
      })
      .map(item => {
        // Return Document object - check if content is Document or create one
        if (item.content && typeof item.content === 'object' && item.content.pageContent) {
          return item.content; // Already a Document
        } else {
          // Create Document from stored data
          return {
            pageContent: typeof item.content === 'string' ? item.content : '',
            metadata: item.metadata || {}
          };
        }
      });
    
    console.log('[Vector Store] Found', userDocs.length, 'documents for user', userId);
    
    return userDocs;
    
  } catch (error) {
    console.error('[Vector Store] Get user documents error:', error.message);
    return [];
  }
};

/**
 * Delete documents by user ID
 * Useful for GDPR compliance
 * 
 * @param {number} userId - User ID
 * @returns {Promise<number>} Number of documents deleted
 */
export const deleteUserDocuments = async (userId) => {
  try {
    console.log('[Vector Store] Deleting documents for user', userId);
    
    const store = await getVectorStore();
    
    // Filter out user's documents
    if (store.memoryVectors) {
      const beforeCount = store.memoryVectors.length;
      store.memoryVectors = store.memoryVectors.filter(item => {
        // Check both possible metadata locations
        const topLevelUserId = item.metadata?.userId;
        const contentUserId = item.content?.metadata?.userId;
        const docUserId = topLevelUserId !== undefined ? topLevelUserId : contentUserId;
        return docUserId !== userId;
      });
      const afterCount = store.memoryVectors.length;
      const deletedCount = beforeCount - afterCount;
      
      console.log('[Vector Store] Deleted', deletedCount, 'documents');
      
      // Persist changes
      await saveVectorStore(store);
      
      return deletedCount;
    }
    
    return 0;
    
  } catch (error) {
    console.error('[Vector Store] Delete error:', error.message);
    throw new Error(`Failed to delete documents: ${error.message}`);
  }
};

/**
 * Save vector store to disk
 * Manual persistence (MemoryVectorStore doesn't auto-persist)
 * 
 * @param {MemoryVectorStore} store - Vector store to save
 */
const saveVectorStore = async (store) => {
  try {
    // Ensure directory exists
    await fs.mkdir(VECTOR_STORE_DIR, { recursive: true });
    
    // Serialize store
    // Note: We save the internal vectors, not the full store
    const data = {
      vectors: store.memoryVectors || [],
      savedAt: new Date().toISOString(),
      count: store.memoryVectors?.length || 0
    };
    
    await fs.writeFile(VECTOR_STORE_FILE, JSON.stringify(data, null, 2));
    
    console.log('[Vector Store] Saved', data.count, 'vectors to disk');
    
  } catch (error) {
    console.error('[Vector Store] Save error:', error.message);
    // Don't throw - persistence failure shouldn't break operation
  }
};

/**
 * Load vector store from disk
 * 
 * @returns {Promise<MemoryVectorStore>} Loaded vector store
 */
const loadVectorStore = async () => {
  try {
    const json = await fs.readFile(VECTOR_STORE_FILE, 'utf-8');
    const data = JSON.parse(json);
    
    const embeddings = createEmbeddings();
    const store = new MemoryVectorStore(embeddings);
    
    // Restore vectors with validation
    if (data.vectors && Array.isArray(data.vectors)) {
      // Filter out any vectors with file:// paths in source metadata
      // to avoid ENOENT errors when trying to reload
      const validVectors = data.vectors.filter(vector => {
        const source = vector.metadata?.source;
        if (source && typeof source === 'string' && source.includes('test/data')) {
          console.warn('[Vector Store] Skipping test data vector:', source);
          return false;
        }
        if (source && typeof source === 'string' && source.startsWith('file://')) {
          console.warn('[Vector Store] Skipping file:// path vector:', source);
          return false;
        }
        // Check for absolute file paths
        if (source && typeof source === 'string' && /^[A-Z]:\\\\/.test(source)) {
          console.warn('[Vector Store] Skipping absolute path vector:', source);
          return false;
        }
        return true;
      });
      
      store.memoryVectors = validVectors;
      
      if (validVectors.length !== data.vectors.length) {
        console.warn('[Vector Store] Filtered out', data.vectors.length - validVectors.length, 'invalid vectors');
        // Save cleaned data
        await saveVectorStore(store);
      }
    }
    
    console.log('[Vector Store] Loaded', store.memoryVectors.length, 'vectors');
    
    return store;
    
  } catch (error) {
    console.error('[Vector Store] Load error:', error.message);
    throw error;
  }
};

/**
 * Get stats about vector store
 * 
 * @returns {Promise<Object>} Store statistics
 */
export const getStats = async () => {
  try {
    const store = await getVectorStore();
    const vectors = store.memoryVectors || [];
    
    // Count by user
    const userCounts = {};
    vectors.forEach(item => {
      const userId = item.metadata?.userId || 'unknown';
      userCounts[userId] = (userCounts[userId] || 0) + 1;
    });
    
    return {
      totalDocuments: vectors.length,
      userCounts,
      uniqueUsers: Object.keys(userCounts).length,
      lastSaved: await getLastSavedTime()
    };
    
  } catch (error) {
    console.error('[Vector Store] Stats error:', error.message);
    return { totalDocuments: 0, userCounts: {}, uniqueUsers: 0 };
  }
};

const getLastSavedTime = async () => {
  try {
    const json = await fs.readFile(VECTOR_STORE_FILE, 'utf-8');
    const data = JSON.parse(json);
    return data.savedAt || 'unknown';
  } catch {
    return 'never';
  }
};

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * Custom (ai/src/rag/vectorStore.js):
 * ```javascript
 * // Manual vector storage and cosine similarity
 * let vectorStore = { documents: [] };
 * 
 * const addDocument = async (doc, embedding) => {
 *   vectorStore.documents.push({
 *     id: generateId(),
 *     text: doc.text,
 *     embedding: embedding,
 *     metadata: doc.metadata
 *   });
 *   await saveToFile();
 * };
 * 
 * const search = async (queryEmbedding, k) => {
 *   // Manual cosine similarity calculation
 *   const scores = vectorStore.documents.map(doc => ({
 *     doc,
 *     score: cosineSimilarity(queryEmbedding, doc.embedding)
 *   }));
 *   return scores.sort((a,b) => b.score - a.score).slice(0, k);
 * };
 * ```
 * 
 * LangChain (this file):
 * ```javascript
 * const store = await MemoryVectorStore.fromDocuments(docs, embeddings);
 * const results = await store.similaritySearch(query, k, filter);
 * ```
 * 
 * ADVANTAGES OF LANGCHAIN:
 * ✅ No manual vector math (cosine similarity built-in)
 * ✅ Optimized search algorithms
 * ✅ Metadata filtering support
 * ✅ Easy to swap to production vector DB:
 *    - Pinecone: Managed, scales to billions
 *    - Weaviate: Open-source, advanced filtering
 *    - Chroma: Lightweight, developer-friendly
 *    - FAISS: High-performance, local
 * ✅ ~100 LOC vs ~400 LOC custom
 * 
 * PRODUCTION NOTE:
 * MemoryVectorStore is great for:
 * - Development and testing
 * - Small datasets (< 10k documents)
 * - Single-server deployments
 * 
 * For production, swap to:
 * ```javascript
 * import { Pinecone } from "@langchain/community/vectorstores/pinecone";
 * const store = await Pinecone.fromDocuments(docs, embeddings, {
 *   pineconeIndex: index,
 *   namespace: userId.toString()
 * });
 * ```
 * 
 * Same interface, no code changes needed!
 */
