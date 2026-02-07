/**
 * PDF UPLOAD ROUTE
 * 
 * Purpose:
 * - Accepts PDF expense statement uploads
 * - Triggers RAG pipeline (extract → chunk → embed → store)
 * - Returns upload status and document metadata
 * 
 * Why it exists:
 * - Entry point for document-based intelligence
 * - Separates upload logic from chat endpoint
 * - Enables batch document processing
 * 
 * Architecture fit:
 * - Standalone route: POST /ai/upload
 * - Triggers full RAG pipeline
 * - Stores vectors for later similarity search
 */

import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { extractTextByPage, isValidPDF, cleanExtractedText } from '../utils/pdfExtractor.js';
import { chunkText } from '../rag/chunker.js';
import { generateEmbeddings } from '../rag/embeddings.js';
import { storeDocument } from '../rag/vectorStore.js';

const router = express.Router();

// Configure multer for file upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

/**
 * Upload PDF expense statement
 * POST /ai/upload
 * Headers: Authorization: Bearer <JWT>
 * Body: multipart/form-data with 'file' field
 */
router.post('/upload', authMiddleware, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No file uploaded. Please upload a PDF file.'
      });
    }

    console.log(`[Upload Route] Received file: ${req.file.originalname} (${req.file.size} bytes)`);

    // Validate PDF
    if (!isValidPDF(req.file.buffer)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid PDF file format.'
      });
    }

    // Step 1: Extract text from PDF with page metadata
    // Add Page Metadata for better attribution
    const pages = await extractTextByPage(req.file.buffer);
    
    if (!pages || pages.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'PDF appears to be empty or contains no readable text.'
      });
    }
    
    const numPages = pages.length;
    console.log(`[Upload Route] Extracted ${numPages} pages`);
    
    // Step 2: Chunk each page separately (preserves page attribution)
    // Chunk size now 1500 chars (see chunker.js fix)
    const allChunks = [];
    for (const page of pages) {
      const cleanedText = cleanExtractedText(page.text);
      
      if (cleanedText.length < 50) {
        console.log(`[Upload Route] Skipping page ${page.pageNumber} (insufficient text)`);
        continue;
      }
      
      const pageChunks = chunkText(cleanedText);
      
      // Attach page number to each chunk for citation
      pageChunks.forEach(chunk => {
        chunk.pageNumber = page.pageNumber;
        allChunks.push(chunk);
      });
    }

    console.log(`[Upload Route] Created ${allChunks.length} chunks from ${numPages} pages`);
    
    if (allChunks.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No valid text chunks could be extracted from the PDF.'
      });
    }

    // Step 3: Generate embeddings for all chunks
    const chunkTexts = allChunks.map(c => c.text);
    const embeddings = await generateEmbeddings(chunkTexts);

    console.log(`[Upload Route] Generated ${embeddings.length} embeddings`);
    
    // Step 4: Store in vector database
    // Pass userId for user isolation
    const documentId = await storeDocument({
      filename: req.file.originalname,
      chunks: allChunks,
      embeddings,
      userId: req.user.userId,  // Track document owner
      metadata: {
        numPages,
        numChunks: allChunks.length,
        uploadedAt: new Date().toISOString()
      }
    });

    console.log(`[Upload Route] Successfully stored document with ID: ${documentId}`);

    // Return success response
    res.status(200).json({
      success: true,
      message: 'PDF processed successfully',
      document: {
        id: documentId,
        filename: req.file.originalname,
        numPages,
        numChunks: allChunks.length,
        textLength: chunkTexts.join('').length
      }
    });
  } catch (error) {
    console.error('[Upload Route] Error:', error.message);
    next(error);
  }
});

/**
 * List uploaded documents
 * GET /ai/upload/documents
 */
router.get('/upload/documents', authMiddleware, async (req, res, next) => {
  try {
    // TODO: Implement user-specific document listing
    // For now, return placeholder
    res.json({
      success: true,
      documents: [],
      message: 'Document listing not yet implemented'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
