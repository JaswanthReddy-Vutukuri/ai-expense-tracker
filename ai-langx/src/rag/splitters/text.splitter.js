/**
 * TEXT SPLITTER - LangChain RecursiveCharacterTextSplitter
 * 
 * PURPOSE:
 * - Split documents into smaller chunks for embedding
 * - Maintain semantic coherence
 * - Add overlap for context preservation
 * 
 * LANGCHAIN CONCEPTS:
 * ✅ RecursiveCharacterTextSplitter
 * ✅ Semantic splitting with separators
 * ✅ Chunk size and overlap configuration
 * 
 * COMPARE WITH: ai/src/rag/chunker.js
 */

import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

/**
 * Splitter Configuration
 * Same as custom implementation for consistency
 */
const SPLITTER_CONFIG = {
  CHUNK_SIZE: parseInt(process.env.CHUNK_SIZE) || 500,
  CHUNK_OVERLAP: parseInt(process.env.CHUNK_OVERLAP) || 50,
  // Separators in order of preference (tries these first)
  SEPARATORS: [
    "\n\n",  // Paragraph breaks
    "\n",    // Line breaks
    ". ",    // Sentences
    ", ",    // Clauses
    " ",     // Words
    ""       // Characters (fallback)
  ]
};

/**
 * Create configured text splitter
 * 
 * LANGCHAIN PATTERN:
 * RecursiveCharacterTextSplitter tries to split on:
 * 1. \n\n (paragraphs) first
 * 2. \n (lines) if chunks still too big
 * 3. Sentences, then words, then characters
 * 
 * This maintains semantic coherence better than fixed-size splitting
 * 
 * @returns {RecursiveCharacterTextSplitter} Configured splitter
 */
export const createTextSplitter = () => {
  return new RecursiveCharacterTextSplitter({
    chunkSize: SPLITTER_CONFIG.CHUNK_SIZE,
    chunkOverlap: SPLITTER_CONFIG.CHUNK_OVERLAP,
    separators: SPLITTER_CONFIG.SEPARATORS
  });
};

/**
 * Split documents into chunks
 * 
 * AUTOMATIC FEATURES:
 * ✅ Preserves metadata from original documents
 * ✅ Adds chunk index to metadata
 * ✅ Maintains source references
 * ✅ Respects semantic boundaries
 * 
 * @param {Array<Document>} documents - LangChain documents
 * @returns {Promise<Array<Document>>} Chunked documents
 */
export const splitDocuments = async (documents) => {
  try {
    console.log('[Text Splitter] Splitting', documents.length, 'documents');
    
    const splitter = createTextSplitter();
    const chunks = await splitter.splitDocuments(documents);
    
    console.log('[Text Splitter] Created', chunks.length, 'chunks');
    console.log('[Text Splitter] Chunk size range:', {
      min: Math.min(...chunks.map(c => c.pageContent.length)),
      max: Math.max(...chunks.map(c => c.pageContent.length)),
      avg: Math.round(chunks.reduce((sum, c) => sum + c.pageContent.length, 0) / chunks.length)
    });
    
    // Add chunk index to metadata
    chunks.forEach((chunk, index) => {
      chunk.metadata.chunkIndex = index;
      chunk.metadata.totalChunks = chunks.length;
    });
    
    return chunks;
    
  } catch (error) {
    console.error('[Text Splitter] Error:', error.message);
    throw new Error(`Failed to split documents: ${error.message}`);
  }
};

/**
 * Split text directly (without Document wrapper)
 * Useful for quick text processing
 * 
 * @param {string} text - Text to split
 * @returns {Promise<Array<string>>} Array of text chunks
 */
export const splitText = async (text) => {
  try {
    const splitter = createTextSplitter();
    const chunks = await splitter.splitText(text);
    
    console.log('[Text Splitter] Split text into', chunks.length, 'chunks');
    
    return chunks;
    
  } catch (error) {
    console.error('[Text Splitter] Error:', error.message);
    throw new Error(`Failed to split text: ${error.message}`);
  }
};

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * Custom (ai/src/rag/chunker.js):
 * ```javascript
 * // Manual implementation with regex splitting
 * const chunks = [];
 * let currentChunk = '';
 * // ... complex manual logic ...
 * ```
 * 
 * LangChain (this file):
 * ```javascript
 * const splitter = new RecursiveCharacterTextSplitter({...});
 * const chunks = await splitter.splitDocuments(docs);
 * ```
 * 
 * ADVANTAGES OF LANGCHAIN:
 * ✅ Battle-tested splitting logic
 * ✅ Semantic coherence (tries paragraphs → sentences → words)
 * ✅ Automatic metadata preservation
 * ✅ Configurable separators
 * ✅ No manual chunk management
 * ✅ ~50 LOC vs ~200 LOC custom
 * 
 * WHEN TO USE CUSTOM:
 * ❌ Need domain-specific splitting (e.g., by transaction)
 * ❌ Want specific regex patterns
 * ❌ Custom metadata per chunk
 * 
 * LEARNING NOTE:
 * RecursiveCharacterTextSplitter is one of many splitters:
 * - CharacterTextSplitter: Simple fixed separators
 * - TokenTextSplitter: Split by token count
 * - RecursiveCharacterTextSplitter: Smart semantic splitting (recommended)
 * - MarkdownTextSplitter: Preserves markdown structure
 * - CodeTextSplitter: Language-aware code splitting
 * 
 * For expense documents, RecursiveCharacterTextSplitter works well
 * because it respects paragraph and sentence boundaries.
 */
