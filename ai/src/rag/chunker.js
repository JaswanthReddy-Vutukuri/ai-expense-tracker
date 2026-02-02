/**
 * TEXT CHUNKING ENGINE
 * 
 * Purpose:
 * - Splits long documents into smaller chunks for embedding
 * - Implements overlapping strategy to preserve context
 * - Optimizes chunk size for LLM context windows
 * 
 * Why it exists:
 * - LLM embeddings work best on coherent chunks (not full docs)
 * - Overlap prevents information loss at chunk boundaries
 * - Enables precise retrieval of relevant sections
 * 
 * Architecture fit:
 * - Used by upload route after PDF text extraction
 * - Output feeds into embeddings generator
 * - Configurable chunk size and overlap
 */

/**
 * Splits text into overlapping chunks
 * 
 * AUDIT FIX: Part 4 - Correct Chunk Size Configuration
 * Original: 500 chars ≈ 125 tokens (4x too small)
 * Fixed: 1500 chars ≈ 375 tokens (midpoint of 300-500 requirement)
 * Character-to-token ratio is approximately 4:1 for English text
 * 
 * @param {string} text - Full document text
 * @param {Object} options - Chunking configuration
 * @param {number} options.chunkSize - Target characters per chunk (default: 1500)
 * @param {number} options.overlap - Characters to overlap between chunks (default: 200)
 * @returns {Array<Object>} Array of chunk objects with text, index, and metadata
 */
export const chunkText = (text, options = {}) => {
  const { chunkSize = 1500, overlap = 200 } = options;
  
  if (!text || text.length === 0) {
    return [];
  }
  
  console.log(`[Chunker] Processing ${text.length} characters with chunkSize=${chunkSize}, overlap=${overlap}`);
  
  const chunks = [];
  let startIndex = 0;
  let chunkIndex = 0;
  const MAX_CHUNKS = 10000; // Safety limit to prevent infinite loops
  
  while (startIndex < text.length) {
    // Safety guard: Prevent infinite loop from buggy chunk logic
    if (chunkIndex >= MAX_CHUNKS) {
      console.error(`[Chunker] SAFETY BREAK: Reached ${MAX_CHUNKS} chunks. Possible infinite loop detected.`);
      break;
    }
    
    // Calculate end index for this chunk
    let endIndex = startIndex + chunkSize;
    
    // If not at end, try to break at sentence boundary
    if (endIndex < text.length) {
      // Look for sentence endings within the chunk
      const chunkText = text.substring(startIndex, endIndex + 100); // Look ahead
      const sentenceEnd = chunkText.search(/[.!?]\s+/);
      
      if (sentenceEnd !== -1 && sentenceEnd > chunkSize * 0.7) {
        // Found a good break point
        endIndex = startIndex + sentenceEnd + 1;
      }
    } else {
      endIndex = text.length;
    }
    
    const chunkText = text.substring(startIndex, endIndex).trim();
    
    if (chunkText.length > 0) {
      chunks.push({
        index: chunkIndex,
        text: chunkText,
        startChar: startIndex,
        endChar: endIndex,
        length: chunkText.length
      });
      
      chunkIndex++;
    }
    
    // CRITICAL FIX: Prevent infinite loop when reaching end of text
    // 
    // BUG EXPLANATION:
    // When endIndex reaches text.length (e.g., 441), the calculation
    // "startIndex = endIndex - overlap" (441 - 200 = 241) causes startIndex
    // to move BACKWARD. This creates an infinite loop:
    //   Iteration 1: start=0, end=441
    //   Iteration 2: start=241, end=441  <- Same chunk!
    //   Iteration 3: start=241, end=441  <- Infinite loop!
    // 
    // WHY OVERLAP IS DANGEROUS:
    // Overlap allows chunks to share context, BUT when we reach the end,
    // subtracting overlap makes us revisit already-processed text.
    // 
    // THE FIX:
    // 1. If endIndex reached text.length, we're done - BREAK immediately
    // 2. Don't subtract overlap on the final chunk
    // 3. This ensures startIndex ALWAYS progresses forward
    if (endIndex >= text.length) {
      console.log(`[Chunker] Reached end of text. Created ${chunks.length} chunks. Terminating.`);
      break;
    }
    
    // Store current start to detect stalls
    const previousStart = startIndex;
    
    // Move to next chunk with overlap
    startIndex = endIndex - overlap;
    
    // SAFETY GUARD: Ensure startIndex always progresses
    // If overlap is too large or chunk size too small, we might stall
    if (startIndex <= previousStart) {
      console.error(`[Chunker] SAFETY BREAK: startIndex didn't progress (${previousStart} -> ${startIndex}). This indicates overlap >= chunkSize.`);
      break;
    }
  }
  
  console.log(`[Chunker] ✓ Chunking complete: ${chunks.length} chunks from ${text.length} characters`);
  
  return chunks;
};

/**
 * Splits text by paragraphs, then chunks if paragraphs are too large
 * Better preserves semantic coherence
 * @param {string} text - Full document text
 * @param {Object} options - Chunking configuration
 * @returns {Array<Object>} Array of chunk objects
 */
export const chunkByParagraph = (text, options = {}) => {
  const { chunkSize = 500, overlap = 100 } = options;
  
  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  
  const chunks = [];
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const paragraph of paragraphs) {
    const trimmedPara = paragraph.trim();
    
    // If paragraph itself is too large, use regular chunking
    if (trimmedPara.length > chunkSize * 1.5) {
      // Flush current chunk first
      if (currentChunk.length > 0) {
        chunks.push({
          index: chunkIndex++,
          text: currentChunk.trim(),
          length: currentChunk.length
        });
        currentChunk = '';
      }
      
      // Chunk the large paragraph
      const paraChunks = chunkText(trimmedPara, { chunkSize, overlap });
      paraChunks.forEach(chunk => {
        chunks.push({
          ...chunk,
          index: chunkIndex++
        });
      });
      
      continue;
    }
    
    // Check if adding this paragraph exceeds chunk size
    if (currentChunk.length + trimmedPara.length > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        index: chunkIndex++,
        text: currentChunk.trim(),
        length: currentChunk.length
      });
      
      // Start new chunk with overlap
      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + '\n\n' + trimmedPara;
    } else {
      // Add to current chunk
      currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + trimmedPara;
    }
  }
  
  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push({
      index: chunkIndex++,
      text: currentChunk.trim(),
      length: currentChunk.length
    });
  }
  
  console.log(`[Chunker] Created ${chunks.length} paragraph-based chunks`);
  
  return chunks;
};

/**
 * Validates chunk configuration
 * @param {number} chunkSize - Proposed chunk size
 * @param {number} overlap - Proposed overlap
 * @throws {Error} If configuration is invalid
 */
export const validateChunkConfig = (chunkSize, overlap) => {
  if (chunkSize <= 0) {
    throw new Error('Chunk size must be positive');
  }
  
  if (overlap < 0) {
    throw new Error('Overlap cannot be negative');
  }
  
  if (overlap >= chunkSize) {
    throw new Error('Overlap must be less than chunk size');
  }
};
