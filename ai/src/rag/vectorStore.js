/**
 * VECTOR STORE (In-Memory with Persistence)
 * 
 * Purpose:
 * - Stores document chunks and their embeddings
 * - Enables similarity search over embedded documents
 * - Persists to disk for durability
 * 
 * Why it exists:
 * - Central repository for RAG document data
 * - Enables efficient vector similarity queries
 * - Provides document management and retrieval
 * 
 * Architecture fit:
 * - Used by upload route to store processed documents
 * - Used by search module for similarity queries
 * - Used by comparison engine to extract expenses
 * 
 * Data Structure:
 * {
 *   documents: [
 *     {
 *       id: 'doc_123',
 *       filename: 'statement.pdf',
 *       chunks: [{index, text, embedding, ...}, ...],
 *       metadata: {...}
 *     }
 *   ]
 * }
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory storage
let vectorStore = {
  documents: [],
  metadata: {
    totalDocuments: 0,
    totalChunks: 0,
    lastUpdated: null
  }
};

// Persistence configuration
const VECTOR_STORE_PATH = path.join(__dirname, '../../data/vector-store.json');

/**
 * Loads vector store from disk
 */
export const loadVectorStore = async () => {
  try {
    const data = await fs.readFile(VECTOR_STORE_PATH, 'utf-8');
    vectorStore = JSON.parse(data);
    console.log(`[Vector Store] Loaded ${vectorStore.documents.length} documents from disk`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('[Vector Store] No existing data file, starting fresh');
    } else {
      console.error('[Vector Store] Error loading from disk:', error.message);
    }
  }
};

/**
 * Saves vector store to disk
 */
export const saveVectorStore = async () => {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(VECTOR_STORE_PATH);
    await fs.mkdir(dataDir, { recursive: true });
    
    // Save to disk
    await fs.writeFile(VECTOR_STORE_PATH, JSON.stringify(vectorStore, null, 2));
    console.log('[Vector Store] Saved to disk');
  } catch (error) {
    console.error('[Vector Store] Error saving to disk:', error.message);
  }
};

/**
 * Generates unique document ID
 * @returns {string} Unique document ID
 */
const generateDocumentId = () => {
  return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Stores a new document with its chunks and embeddings
 * 
 * User Isolation
 * Now requires and stores userId to enable per-user document filtering
 * 
 * @param {Object} document - Document data
 * @param {string} document.filename - Original filename
 * @param {Array} document.chunks - Text chunks
 * @param {Array} document.embeddings - Embedding vectors
 * @param {number} document.userId - Owner user ID (REQUIRED for isolation)
 * @param {Object} document.metadata - Additional metadata
 * @returns {Promise<string>} Document ID
 */
export const storeDocument = async (document) => {
  const { filename, chunks, embeddings, userId, metadata = {} } = document;
  
  // Enforce userId requirement for multi-tenancy
  // If userId is null (JWT_SECRET not configured), allow but warn
  if (userId === undefined) {
    throw new Error('userId parameter is required for document storage');
  }
  
  if (userId === null) {
    console.warn('[Vector Store] WARNING: Storing document without userId - JWT_SECRET not configured. User isolation disabled.');
  }
  
  if (chunks.length !== embeddings.length) {
    throw new Error('Number of chunks must match number of embeddings');
  }
  
  const documentId = generateDocumentId();
  
  // Combine chunks with embeddings
  const enrichedChunks = chunks.map((chunk, idx) => ({
    ...chunk,
    embedding: embeddings[idx],
    documentId
  }));
  
  const newDocument = {
    id: documentId,
    filename,
    chunks: enrichedChunks,
    metadata: {
      ...metadata,
      userId,  // Store userId for filtering
      storedAt: new Date().toISOString()
    }
  };
  
  vectorStore.documents.push(newDocument);
  vectorStore.metadata.totalDocuments = vectorStore.documents.length;
  vectorStore.metadata.totalChunks += chunks.length;
  vectorStore.metadata.lastUpdated = new Date().toISOString();
  
  console.log(`[Vector Store] Stored document ${documentId} for user ${userId} with ${chunks.length} chunks`);
  
  // Persist to disk
  await saveVectorStore();
  
  return documentId;
};

/**
 * Retrieves all chunks from documents owned by specified user
 * 
 * User Isolation
 * Filters documents by userId to prevent cross-user data exposure
 * This is the CRITICAL security fix - prevents User A from seeing User B's PDFs
 * 
 * @param {number} userId - User ID to filter by (REQUIRED for production)
 * @returns {Array} Chunks belonging to the specified user only
 */
export const getAllChunks = (userId) => {
  // Enforce userId parameter for security
  // If userId is null (JWT_SECRET not configured), return all chunks (backward compatibility)
  if (userId === undefined) {
    throw new Error('userId parameter is required for getAllChunks');
  }
  
  if (userId === null) {
    console.warn('[Vector Store] WARNING: Returning all chunks (no user filtering) - JWT_SECRET not configured');
    const allChunks = [];
    for (const doc of vectorStore.documents) {
      for (const chunk of doc.chunks) {
        allChunks.push({
          ...chunk,
          filename: doc.filename,
          documentId: doc.id
        });
      }
    }
    return allChunks;
  }
  
  const allChunks = [];
  
  // Filter documents by userId before returning chunks
  for (const doc of vectorStore.documents) {
    // Skip documents not owned by this user
    if (doc.metadata.userId !== userId) {
      continue;
    }
    
    for (const chunk of doc.chunks) {
      allChunks.push({
        ...chunk,
        filename: doc.filename,
        documentId: doc.id
      });
    }
  }
  
  console.log(`[Vector Store] Retrieved ${allChunks.length} chunks for user ${userId}`);
  return allChunks;
};

/**
 * Retrieves a specific document by ID
 * @param {string} documentId - Document ID
 * @returns {Object|null} Document or null if not found
 */
export const getDocument = (documentId) => {
  return vectorStore.documents.find(doc => doc.id === documentId) || null;
};

/**
 * Lists all documents (without chunk details)
 * @returns {Array} Document summaries
 */
export const listDocuments = () => {
  return vectorStore.documents.map(doc => ({
    id: doc.id,
    filename: doc.filename,
    numChunks: doc.chunks.length,
    metadata: doc.metadata
  }));
};

/**
 * Deletes a document by ID
 * @param {string} documentId - Document ID
 * @returns {Promise<boolean>} True if deleted
 */
export const deleteDocument = async (documentId) => {
  const index = vectorStore.documents.findIndex(doc => doc.id === documentId);
  
  if (index === -1) {
    return false;
  }
  
  const deletedDoc = vectorStore.documents.splice(index, 1)[0];
  
  vectorStore.metadata.totalDocuments = vectorStore.documents.length;
  vectorStore.metadata.totalChunks -= deletedDoc.chunks.length;
  vectorStore.metadata.lastUpdated = new Date().toISOString();
  
  console.log(`[Vector Store] Deleted document ${documentId}`);
  
  await saveVectorStore();
  
  return true;
};

/**
 * Clears all documents from the store
 * @returns {Promise<void>}
 */
export const clearVectorStore = async () => {
  vectorStore = {
    documents: [],
    metadata: {
      totalDocuments: 0,
      totalChunks: 0,
      lastUpdated: new Date().toISOString()
    }
  };
  
  console.log('[Vector Store] Cleared all documents');
  
  await saveVectorStore();
};

/**
 * Gets vector store statistics
 * @returns {Object} Statistics
 */
export const getVectorStoreStats = () => {
  return {
    ...vectorStore.metadata,
    documents: vectorStore.documents.map(doc => ({
      id: doc.id,
      filename: doc.filename,
      numChunks: doc.chunks.length,
      uploadedAt: doc.metadata.uploadedAt
    }))
  };
};

/**
 * Extracts expense data from stored documents
 * 
 * User Isolation in Expense Extraction
 * Filters documents by userId before extracting expenses
 * 
 * Used by comparison handler
 * @param {number} userId - User ID to filter documents (REQUIRED)
 * @returns {Array} Extracted expenses from user's documents only
 */
export const extractExpensesFromVectorStore = async (userId) => {
  // Enforce userId for security
  if (userId === undefined) {
    throw new Error('userId parameter is required for extractExpensesFromVectorStore');
  }
  
  console.log(`[Vector Store] Extracting expenses for userId: ${userId}`);
  console.log(`[Vector Store] Total documents in store: ${vectorStore.documents.length}`);
  
  if (userId === null) {
    console.warn('[Vector Store] WARNING: Extracting all expenses (no user filtering) - JWT_SECRET not configured');
    const expenses = [];
    for (const doc of vectorStore.documents) {
      for (const chunk of doc.chunks) {
        const expensePattern = /(\d+(?:\.\d{2})?)\s*(?:₹|Rs\.?|INR)?\s+(?:for|on)?\s+([a-zA-Z\s]+?)(?:on|dated)?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})?/gi;
        let match;
        while ((match = expensePattern.exec(chunk.text)) !== null) {
          expenses.push({
            amount: parseFloat(match[1]),
            description: match[2].trim(),
            date: match[3] || null,
            source: 'PDF',
            documentId: doc.id,
            filename: doc.filename,
            chunkIndex: chunk.index
          });
        }
      }
    }
    console.log(`[Vector Store] Extracted ${expenses.length} expenses from documents (no user filter)`);
    return expenses;
  }
  
  const expenses = [];
  
  // Filter documents by userId
  let userDocumentCount = 0;
  for (const doc of vectorStore.documents) {
    console.log(`[Vector Store] Document ${doc.id}: userId=${doc.metadata.userId}, filename=${doc.filename}`);
    
    // Skip documents not owned by this user
    if (doc.metadata.userId !== userId) {
      console.log(`[Vector Store] Skipping document ${doc.id} (userId mismatch: ${doc.metadata.userId} !== ${userId})`);
      continue;
    }
    
    userDocumentCount++;
    console.log(`[Vector Store] Processing document ${doc.id} with ${doc.chunks.length} chunks`);
    
    for (const chunk of doc.chunks) {
      console.log(`[Vector Store] Chunk ${chunk.index} text preview: "${chunk.text.substring(0, 200)}..."`);
      
      // PDF-specific patterns based on actual document formats
      
      // Pattern 1: Electricity bill format (compact, no spaces)
      // Example: "09-12-20251,255.0073.000"
      const electricityPattern = /(\d{2}-\d{2}-\d{4})(\d+(?:\.\d{2})?)(\d+\.\d{3})/g;
      
      // Pattern 2: Expense statement format (compact table)
      // Example: "Feb 1, 2026ClothesShopping$300.00"
      const expenseTablePattern = /([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})([A-Z][a-zA-Z\s]+?)([A-Z][a-zA-Z]+)\$(\d+(?:\.\d{2})?)/g;
      
      // Pattern 3: Standard formats with currency symbols
      const currencyPattern1 = /(?:₹|Rs\.?|INR)\s*(\d+(?:\.\d{2})?)\s+(?:for|on|-)?\s*([a-zA-Z\s,]+)/gi;
      
      // Pattern 4: Amount with description (loose matching)
      const amountDescPattern = /(\d+(?:\.\d{2})?)\s*(?:₹|Rs\.?|INR|\$)?\s+(?:for|on)?\s*([a-zA-Z\s,]+)/gi;
      
      const patterns = [
        {
          regex: electricityPattern,
          extractor: (match) => ({
            amount: parseFloat(match[2]),
            description: 'Electricity Bill',
            date: match[1],
            format: 'Electricity Bill (BESCOM)'
          })
        },
        {
          regex: expenseTablePattern,
          extractor: (match) => ({
            amount: parseFloat(match[4]),
            description: match[2].trim(),
            date: match[1],
            category: match[3],
            format: 'Expense Statement Table'
          })
        },
        {
          regex: currencyPattern1,
          extractor: (match) => ({
            amount: parseFloat(match[1]),
            description: match[2].trim(),
            date: null,
            format: 'Currency-Amount-Description'
          })
        }
      ];
      
      let matchFound = false;
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.regex.exec(chunk.text)) !== null) {
          matchFound = true;
          const expenseData = pattern.extractor(match);
          const expense = {
            ...expenseData,
            source: 'PDF',
            documentId: doc.id,
            filename: doc.filename,
            chunkIndex: chunk.index
          };
          expenses.push(expense);
          console.log(`[Vector Store] Extracted expense: $${expense.amount} for ${expense.description} (format: ${expense.format})`);
        }
      }
      
      if (!matchFound) {
        console.warn(`[Vector Store] No expenses matched in chunk ${chunk.index}. Text sample: "${chunk.text.substring(0, 100)}"`);
      }
    }
  }
  
  console.log(`[Vector Store] Found ${userDocumentCount} documents for user ${userId}`);
  console.log(`[Vector Store] Extracted ${expenses.length} expenses from documents`);
  
  return expenses;
};

// Initialize vector store on module load
loadVectorStore().catch(err => {
  console.error('[Vector Store] Initialization error:', err.message);
});
