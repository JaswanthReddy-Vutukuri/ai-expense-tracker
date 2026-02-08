/**
 * UPLOAD ROUTE - PDF Upload and Processing
 * 
 * PURPOSE:
 * - Handle PDF file uploads
 * - Extract text and create embeddings
 * - Store in vector database
 * 
 * LANGCHAIN INTEGRATION:
 * ✅ PDF loader
 * ✅ Text splitter
 * ✅ Embeddings generation
 * ✅ Vector store ingestion
 * 
 * ROUTE: POST /ai/upload
 */

import express from 'express';
import multer from 'multer';
// Lazy load PDF processing - avoid requiring pdf-parse at module load time
// import { loadPDFFromBuffer } from '../rag/loaders/pdf.loader.js';
import { splitDocuments } from '../rag/splitters/text.splitter.js';
import { addDocuments } from '../rag/vectorstore/memory.store.js';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Only accept PDFs
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

/**
 * Upload PDF and add to vector store
 * 
 * LANGCHAIN PIPELINE:
 * 1. Load PDF → Documents
 * 2. Split → Chunks
 * 3. Embed → Vectors
 * 4. Store → Vector DB
 * 
 * All automatic with LangChain!
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized' 
      });
    }
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }
    
    console.log('[Upload] Processing file:', req.file.originalname);
    console.log('[Upload] Size:', req.file.size, 'bytes');
    console.log('[Upload] MIME type:', req.file.mimetype);
    console.log('[Upload] User ID:', userId);
    console.log('[Upload] Buffer details:', {
      exists: !!req.file.buffer,
      isBuffer: Buffer.isBuffer(req.file.buffer),
      length: req.file.buffer?.length,
      first5Bytes: req.file.buffer?.slice(0, 5).toString('utf8')
    });
    
    // Validate buffer
    if (!req.file.buffer) {
      console.error('[Upload] ERROR: req.file.buffer is null/undefined!');
      return res.status(400).json({
        success: false,
        error: 'File buffer is missing - upload may have failed'
      });
    }
    
    if (!Buffer.isBuffer(req.file.buffer)) {
      console.error('[Upload] ERROR: req.file.buffer is not a Buffer object!');
      return res.status(400).json({
        success: false,
        error: 'Invalid file buffer type'
      });
    }
    
    if (req.file.buffer.length === 0) {
      console.error('[Upload] ERROR: Buffer is empty (0 bytes)!');
      return res.status(400).json({
        success: false,
        error: 'Empty file buffer - file may be corrupted'
      });
    }
    
    console.log('[Upload] Buffer validation passed ✓');
    
    // Lazy load PDF loader (avoid loading at module initialization)
    console.log('[Upload] Importing PDF loader...');
    const { loadPDFFromBuffer } = await import('../rag/loaders/pdf.loader.js');
    
    // Step 1: Load PDF
    console.log('[Upload] Step 1: Loading PDF from buffer...');
    const documents = await loadPDFFromBuffer(
      req.file.buffer,
      {
        userId,
        filename: req.file.originalname,
        source: `upload://${req.file.originalname}`, // Use upload:// scheme instead of file path
        uploadedAt: new Date().toISOString()
      }
    );
    
    console.log('[Upload] Loaded', documents.length, 'pages');
    console.log('[Upload] Sample loaded doc metadata:', documents[0]?.metadata);
    
    // Step 2: Split into chunks
    console.log('[Upload] Step 2: Splitting into chunks...');
    const chunks = await splitDocuments(documents);
    
    console.log('[Upload] Created', chunks.length, 'chunks');
    console.log('[Upload] Sample chunk metadata:', chunks[0]?.metadata);
    
    // Step 3 & 4: Embed and store (automatic!)
    console.log('[Upload] Step 3: Generating embeddings and storing...');
    console.log('[Upload] Passing userId to addDocuments:', userId);
    const ids = await addDocuments(chunks, { userId });
    
    console.log('[Upload] Stored', ids.length, 'vectors');
    
    // Calculate total text length for response
    const textLength = chunks.reduce((sum, chunk) => sum + (chunk.pageContent?.length || 0), 0);
    
    // Generate document ID (timestamp-based)
    const documentId = `doc_${Date.now()}`;
    
    // Success response - MUST match frontend UploadResponse interface
    // See: frontend/src/app/services/ai-chat.service.ts:20-28
    return res.json({
      success: true,
      message: 'PDF processed successfully',
      document: {  // ← Frontend expects "document" not "data"!
        id: documentId,
        filename: req.file.originalname,
        numPages: documents.length,   // ← Frontend expects "numPages" not "pages"
        numChunks: chunks.length,     // ← Frontend expects "numChunks" not "chunks"
        textLength: textLength         // ← Frontend expects "textLength"
      }
    });
    
  } catch (error) {
    console.error('[Upload] Error:', error);
    console.error('[Upload] Error stack:', error.stack);
    
    // Guard against undefined error.message
    const errorMsg = error?.message || String(error) || 'Unknown error';
    
    // User-friendly error messages
    let errorMessage = 'Failed to process PDF';
    let statusCode = 500;
    
    if (errorMsg.includes('Invalid PDF')) {
      errorMessage = 'Invalid or corrupted PDF file';
      statusCode = 400;
    } else if (errorMsg.includes('too large') || errorMsg.includes('too long')) {
      errorMessage = 'PDF is too large or has too many pages';
      statusCode = 400;
    } else if (errorMsg.includes('no text')) {
      errorMessage = 'PDF contains no extractable text (possibly scanned images)';
      statusCode = 400;
    } else if (errorMsg.includes('ENOENT')) {
      errorMessage = 'File system error - please try again';
      statusCode = 500;
      console.error('[Upload] ENOENT error - this may indicate vector store has invalid file paths');
    }
    
    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? errorMsg : undefined
    });
  }
});

/**
 * Get uploaded documents for user
 * 
 * ROUTE: GET /ai/upload/documents
 */
router.get('/documents', async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized' 
      });
    }
    
    // Import here to avoid circular dependency
    const { getUserDocuments } = await import('../rag/vectorstore/memory.store.js');
    const documents = await getUserDocuments(userId);
    
    // Group by filename
    const fileMap = {};
    documents.forEach(doc => {
      const filename = doc.metadata?.filename || 'unknown';
      if (!fileMap[filename]) {
        fileMap[filename] = {
          filename,
          uploadedAt: doc.metadata?.uploadedAt,
          chunks: 0,
          pages: new Set()
        };
      }
      fileMap[filename].chunks++;
      if (doc.metadata?.page) {
        fileMap[filename].pages.add(doc.metadata.page);
      }
    });
    
    const files = Object.values(fileMap).map(file => ({
      ...file,
      pages: file.pages.size
    }));
    
    return res.json({
      success: true,
      data: {
        files,
        totalChunks: documents.length
      }
    });
    
  } catch (error) {
    console.error('[Upload] Get documents error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch documents'
    });
  }
});

/**
 * Delete user's documents
 * GDPR compliance
 * 
 * ROUTE: DELETE /ai/upload/documents
 */
router.delete('/documents', async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized' 
      });
    }
    
    // Import here to avoid circular dependency
    const { deleteUserDocuments } = await import('../rag/vectorstore/memory.store.js');
    const deletedCount = await deleteUserDocuments(userId);
    
    console.log('[Upload] Deleted', deletedCount, 'documents for user', userId);
    
    return res.json({
      success: true,
      message: `Deleted ${deletedCount} document chunks`,
      data: { deletedCount }
    });
    
  } catch (error) {
    console.error('[Upload] Delete error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete documents'
    });
  }
});

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * Custom (ai/src/routes/upload.js):
 * ```javascript
 * router.post('/', upload.single('file'), async (req, res) => {
 *   // Manual PDF parsing
 *   const pdfData = await pdfParse(req.file.buffer);
 *   const text = pdfData.text;
 *   
 *   // Manual chunking
 *   const chunks = chunkText(text, 500);
 *   
 *   // Manual embedding generation
 *   const embeddings = [];
 *   for (const chunk of chunks) {
 *     const embedding = await generateEmbedding(chunk);
 *     embeddings.push(embedding);
 *   }
 *   
 *   // Manual storage
 *   for (let i = 0; i < chunks.length; i++) {
 *     await vectorStore.addDocument({
 *       text: chunks[i],
 *       embedding: embeddings[i],
 *       userId,
 *       filename: req.file.originalname
 *     });
 *   }
 *   
 *   res.json({ success: true });
 * });
 * ```
 * 
 * LangChain (this file):
 * ```javascript
 * const documents = await loadPDFFromBuffer(buffer, metadata);
 * const chunks = await splitDocuments(documents);
 * const ids = await addDocuments(chunks);  // Auto-embeds!
 * res.json({ success: true });
 * ```
 * 
 * ADVANTAGES:
 * ✅ ~100 LOC vs ~250 LOC custom
 * ✅ No manual loops for embedding
 * ✅ Better error handling
 * ✅ Metadata preservation automatic
 * ✅ Batch embedding optimization built-in
 * ✅ Easy to swap PDF loader (Unstructured, etc.)
 * ✅ Easy to swap vector store (Pinecone, etc.)
 * 
 * PRODUCTION ENHANCEMENTS:
 * 
 * 1. Background processing:
 * ```javascript
 * import { Queue } from 'bullmq';
 * const pdfQueue = new Queue('pdf-processing');
 * 
 * router.post('/', upload.single('file'), async (req, res) => {
 *   await pdfQueue.add('process', {
 *     buffer: req.file.buffer,
 *     userId,
 *     filename: req.file.originalname
 *   });
 *   res.json({ success: true, status: 'processing' });
 * });
 * ```
 * 
 * 2. Progress tracking:
 * - Use websockets to update client
 * 
 * 3. OCR for scanned PDFs:
 * ```javascript
 * import { UnstructuredLoader } from "langchain/document_loaders/fs/unstructured";
 * // Automatically handles OCR
 * ```
 * 
 * 4. Advanced document loaders:
 * - Word docs: DocxLoader
 * - Text files: TextLoader
 * - Websites: CheerioWebBaseLoader
 * - All use same interface!
 */

export default router;
