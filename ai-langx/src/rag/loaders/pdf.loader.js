/**
 * PDF DOCUMENT LOADER - LangChain Implementation
 * 
 * PURPOSE:
 * - Load PDF documents for RAG pipeline using LangChain's built-in PDFLoader
 * - Extract text from expense statements/receipts
 * - Convert to LangChain Document format
 * 
 * LANGCHAIN CONCEPTS:
 * ✅ Document loaders (PDFLoader wraps pdf-parse properly)
 * ✅ Document format (pageContent + metadata)
 * ✅ Buffer-based loading (for uploaded files)
 * ✅ Blob support (modern API for binary data)
 * 
 * KEY INSIGHT:
 * Using LangChain's PDFLoader instead of raw pdf-parse:
 * - Handles pdf-parse initialization issues
 * - Provides consistent error handling
 * - Supports both file paths and Blobs
 * - Returns standardized Document format
 * - Automatically extracts metadata
 * 
 * COMPARE WITH: ai/src/utils/pdfExtractor.js
 * - ai/: Direct pdf-parse usage
 * - ai-langx: LangChain's PDFLoader wrapper
 * - Both use pdf-parse underneath, but LangChain handles edge cases
 */

import { PDFLoader } from "langchain/document_loaders/fs/pdf";

/**
 * Load PDF from buffer (uploaded file)
 * 
 * LANGCHAIN PATTERN:
 * Uses PDFLoader with Blob API for buffer-based loading.
 * PDFLoader internally uses pdf-parse but handles all edge cases:
 * - Proper error handling
 * - Metadata extraction
 * - Document format conversion
 * - No module initialization issues
 * 
 * @param {Buffer} buffer - PDF file buffer
 * @param {Object} metadata - Additional metadata (filename, userId, etc.)
 * @returns {Promise<Array<Document>>} Array of LangChain documents
 */
export const loadPDFFromBuffer = async (buffer, metadata = {}) => {
  try {
    console.log('[PDF Loader] Loading PDF from buffer using LangChain PDFLoader');
    console.log('[PDF Loader] Buffer size:', buffer?.length, 'bytes');
    console.log('[PDF Loader] Metadata received:', metadata);
    console.log('[PDF Loader] UserId from metadata:', metadata.userId);
    
    // Validate buffer
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Invalid buffer: not a Buffer object');
    }
    
    if (buffer.length === 0) {
      throw new Error('Empty PDF buffer');
    }
    
    // Check PDF signature
    const header = buffer.slice(0, 5).toString('utf8');
    if (!header.startsWith('%PDF-')) {
      throw new Error(`Invalid PDF header: expected '%PDF-', got '${header}'`);
    }
    
    // Create Blob from buffer for PDFLoader
    // PDFLoader.loadFromBlob() is the proper way to load from memory
    const blob = new Blob([buffer], { type: 'application/pdf' });
    
    console.log('[PDF Loader] Created Blob, using PDFLoader...');
    
    // Use LangChain's PDFLoader - it properly wraps pdf-parse
    const loader = new PDFLoader(blob);
    const docs = await loader.load();
    
    console.log('[PDF Loader] Loaded', docs.length, 'documents');
    console.log('[PDF Loader] Total text length:', docs.reduce((sum, d) => sum + d.pageContent.length, 0), 'characters');
    
    // Enhance metadata for all documents
    docs.forEach(doc => {
      doc.metadata = {
        ...doc.metadata,
        source: metadata.source || `upload://${metadata.filename || 'uploaded.pdf'}`,
        uploadedAt: metadata.uploadedAt || new Date().toISOString(),
        userId: metadata.userId || null,
        fileSize: buffer.length,
        filename: metadata.filename,
        // Preserve any additional metadata
        ...Object.fromEntries(
          Object.entries(metadata).filter(([key]) => 
            !['source', 'uploadedAt', 'userId', 'fileSize', 'filename', 'filePath'].includes(key)
          )
        )
      };
    });
    
    console.log('[PDF Loader] Enhanced metadata for', docs.length, 'documents');
    console.log('[PDF Loader] Sample doc metadata:', docs[0]?.metadata);
    
    return docs;
    
  } catch (error) {
    console.error('[PDF Loader] Error:', error.message);
    throw new Error(`Failed to load PDF: ${error.message}`);
  }
};

/**
 * Load PDF from file path
 * Useful for testing with local files
 * 
 * @param {string} filePath - Path to PDF file
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Array<Document>>} Array of LangChain documents
 */
export const loadPDFFromPath = async (filePath, metadata = {}) => {
  try {
    console.log('[PDF Loader] Loading PDF from path:', filePath);
    
    // Use LangChain's PDFLoader
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();
    
    // Add custom metadata
    docs.forEach(doc => {
      doc.metadata = {
        ...doc.metadata,
        uploadedAt: new Date().toISOString(),
        ...metadata
      };
    });
    
    console.log('[PDF Loader] Loaded', docs.length, 'documents');
    
    return docs;
    
  } catch (error) {
    console.error('[PDF Loader] Error:', error.message);
    throw new Error(`Failed to load PDF from path: ${error.message}`);
  }
};

/**
 * Validate PDF content for RAG
 * Ensures document has meaningful content
 * 
 * @param {Array<Document>} documents - LangChain documents
 * @returns {Object} {valid: boolean, reason: string}
 */
export const validatePDFContent = (documents) => {
  if (!documents || documents.length === 0) {
    return { valid: false, reason: 'No documents loaded' };
  }
  
  const totalLength = documents.reduce((sum, doc) => sum + doc.pageContent.length, 0);
  
  if (totalLength < 100) {
    return { valid: false, reason: 'PDF content too short (less than 100 characters)' };
  }
  
  if (totalLength > 1000000) {
    return { valid: false, reason: 'PDF content too large (over 1MB of text)' };
  }
  
  // Check for at least some alphanumeric content
  const hasContent = documents.some(doc => /[a-zA-Z0-9]/.test(doc.pageContent));
  
  if (!hasContent) {
    return { valid: false, reason: 'PDF appears to contain no readable text' };
  }
  
  return { valid: true, reason: 'Valid PDF content' };
};

/**
 * COMPARING APPROACHES: Custom pdf-parse vs LangChain PDFLoader
 * 
 * ====================================================================
 * QUESTION: "Do we need PDF libraries even in LangChain frameworks?"
 * ANSWER: YES! But LangChain's loaders wrap them properly.
 * ====================================================================
 * 
 * ai/src/utils/pdfExtractor.js (Custom Implementation):
 * ```javascript
 * import pdf from 'pdf-parse';
 * 
 * const extractTextFromPDF = async (buffer) => {
 *   const data = await pdf(buffer);  // Direct usage
 *   return {
 *     text: data.text,
 *     numPages: data.numpages
 *   };
 * };
 * ```
 * 
 * PROS:
 * ✅ Direct control
 * ✅ Zero abstraction overhead
 * ✅ Custom error handling
 * 
 * CONS:
 * ❌ Need to handle pdf-parse quirks manually
 * ❌ Custom Document format - doesn't work with LangChain components
 * ❌ Manual metadata management
 * ❌ Can't easily swap loaders
 * 
 * ====================================================================
 * 
 * ai-langx/src/rag/loaders/pdf.loader.js (LangChain Implementation):
 * ```javascript
 * import { PDFLoader } from "langchain/document_loaders/fs/pdf";
 * 
 * const loadPDFFromBuffer = async (buffer, metadata) => {
 *   const blob = new Blob([buffer], { type: 'application/pdf' });
 *   const loader = new PDFLoader(blob);
 *   const docs = await loader.load();  // ← PDFLoader wraps pdf-parse
 *   
 *   // Enhance with custom metadata
 *   docs.forEach(doc => {
 *     doc.metadata = { ...doc.metadata, ...metadata };
 *   });
 *   
 *   return docs;  // Returns Document[] format
 * };
 * ```
 * 
 * PROS:
 * ✅ PDFLoader handles pdf-parse initialization issues
 * ✅ Returns standardized Document format
 * ✅ Works seamlessly with TextSplitter, VectorStore, etc.
 * ✅ Automatic metadata extraction
 * ✅ Consistent error handling
 * ✅ Easy to swap (replace PDFLoader with WebPDFLoader, S3Loader, etc.)
 * 
 * CONS:
 * ❌ One layer of abstraction (minor)
 * ❌ Less control over pdf-parse options
 * 
 * ====================================================================
 * 
 * UNDERNEATH: Both use pdf-parse library!
 * - ai/: pdf-parse directly
 * - ai-langx: PDFLoader → pdf-parse
 * 
 * KEY INSIGHT:
 * LangChain doesn't eliminate the need for pdf-parse.
 * It provides a standardized wrapper that:
 * 1. Handles edge cases (module initialization, errors)
 * 2. Returns consistent Document format
 * 3. Integrates with rest of LangChain ecosystem
 * 
 * ====================================================================
 * 
 * LANGCHAIN ADVANTAGE IN PRACTICE:
 * 
 * ```javascript
 * // Load from multiple sources - all return Document[]
 * const pdfDocs = await PDFLoader.load(blob);
 * const webDocs = await WebLoader.load(url);
 * const txtDocs = await TextLoader.load(text);
 * 
 * // Process identically - no format conversion needed
 * const allDocs = [...pdfDocs, ...webDocs, ...txtDocs];
 * const chunks = await textSplitter.splitDocuments(allDocs);
 * await vectorStore.addDocuments(chunks);
 * 
 * // Citation automatically works
 * const results = await vectorStore.search(query);
 * results.forEach(doc => {
 *   console.log(`Found in: ${doc.metadata.source}`);  // Works for all sources
 * });
 * ```
 * 
 * WITHOUT LANGCHAIN:
 * ```javascript
 * // Each source returns different format
 * const pdfText = await pdfParse(buffer);     // { text, numpages }
 * const webHtml = await axios.get(url);       // { data }
 * const txtContent = fs.readFileSync(path);   // Buffer
 * 
 * // Manual conversion needed (50-100 LOC of glue code)
 * const pdfChunks = chunkText(pdfText.text, { source: 'pdf' });
 * const webChunks = chunkText(extractTextFromHtml(webHtml.data), { source: 'web' });
 * const txtChunks = chunkText(txtContent.toString(), { source: 'txt' });
 * 
 * // Manual citation tracking
 * const allChunks = [
 *   ...pdfChunks.map(c => ({ ...c, sourceType: 'pdf' })),
 *   ...webChunks.map(c => ({ ...c, sourceType: 'web' })),
 *   ...txtChunks.map(c => ({ ...c, sourceType: 'txt' }))
 * ];
 * ```
 * 
 * CONCLUSION:
 * LangChain doesn't replace libraries like pdf-parse.
 * It provides consistent wrappers that handle edge cases and
 * make components work together seamlessly.
 */
