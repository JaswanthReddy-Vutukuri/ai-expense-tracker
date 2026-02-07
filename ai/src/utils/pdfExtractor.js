/**
 * PDF TEXT EXTRACTOR
 * 
 * Purpose:
 * - Extracts text content from PDF expense statements
 * - Handles various PDF formats
 * - Prepares text for chunking and embedding
 * 
 * Why it exists:
 * - RAG pipeline requires text extraction from PDFs
 * - Centralizes PDF processing logic
 * - Provides error handling for malformed PDFs
 * 
 * Architecture fit:
 * - Used by upload route to process uploaded PDFs
 * - Output feeds into chunking engine
 * - Abstracts PDF library implementation details
 */

import pdf from 'pdf-parse';

/**
 * Extracts text from PDF buffer
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @returns {Promise<Object>} Extracted text and metadata
 */
export const extractTextFromPDF = async (pdfBuffer) => {
  console.log('[PDF Extractor] Processing PDF...');
  
  try {
    const data = await pdf(pdfBuffer);
    
    console.log(`[PDF Extractor] Extracted ${data.numpages} pages, ${data.text.length} characters`);
    
    return {
      text: data.text,
      numPages: data.numpages,
      metadata: {
        info: data.info || {},
        extractedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('[PDF Extractor] Error:', error.message);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
};

/**
 * Validates PDF buffer
 * @param {Buffer} buffer - File buffer to validate
 * @returns {boolean} True if valid PDF
 */
export const isValidPDF = (buffer) => {
  if (!Buffer.isBuffer(buffer)) {
    return false;
  }
  
  // Check PDF signature (magic bytes)
  const pdfSignature = buffer.toString('utf8', 0, 5);
  return pdfSignature === '%PDF-';
};

/**
 * Cleans extracted text for better processing
 * @param {string} text - Raw extracted text
 * @returns {string} Cleaned text
 */
export const cleanExtractedText = (text) => {
  return text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};

/**
 * Extracts text from PDF with page-level metadata
 * 
 * Add Page Metadata
 * Enables attribution of expenses to specific PDF pages
 * Improves user experience with page citations
 * 
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @returns {Promise<Array>} Array of {pageNumber, text, charCount} objects
 */
export const extractTextByPage = async (pdfBuffer) => {
  console.log('[PDF Extractor] Processing PDF with page metadata...');
  
  try {
    // Attempt extraction with page metadata
    const data = await pdf(pdfBuffer);
    
    // Split by form feed character (\f) which separates pages in pdf-parse output
    // This is a standard page delimiter in PDF text extraction
    const pageTexts = data.text.split('\f');
    
    const pages = pageTexts.map((text, idx) => ({
      pageNumber: idx + 1,
      text: text.trim(),
      charCount: text.trim().length
    })).filter(page => page.text.length > 0); // Filter empty pages
    
    console.log(`[PDF Extractor] Extracted ${pages.length} pages with page numbers`);
    pages.forEach(p => console.log(`  Page ${p.pageNumber}: ${p.charCount} characters`));
    
    return pages;
  } catch (error) {
    console.error('[PDF Extractor] Error extracting by page:', error.message);
    console.warn('[PDF Extractor] Attempting fallback: using basic text extraction');
    
    // FALLBACK 1: Try basic extraction without page parsing
    try {
      const basicResult = await extractTextFromPDF(pdfBuffer);
      
      if (!basicResult.text || basicResult.text.trim().length === 0) {
        throw new Error('PDF contains no extractable text');
      }
      
      console.log(`[PDF Extractor] Fallback 1 successful: ${basicResult.text.length} characters extracted as single page`);
      
      return [{
        pageNumber: 1,
        text: basicResult.text.trim(),
        charCount: basicResult.text.trim().length
      }];
    } catch (fallbackError1) {
      console.error('[PDF Extractor] Fallback 1 failed:', fallbackError1.message);
      console.warn('[PDF Extractor] Attempting fallback 2: relaxed parsing');
      
      // FALLBACK 2: Try with maximum error tolerance
      try {
        const data = await pdf(pdfBuffer, {
          max: 0,
          version: 'default'
        });
        
        if (!data.text || data.text.trim().length === 0) {
          throw new Error('PDF contains no extractable text');
        }
        
        console.log(`[PDF Extractor] Fallback 2 successful: ${data.text.length} characters`);
        
        return [{
          pageNumber: 1,
          text: data.text.trim(),
          charCount: data.text.trim().length
        }];
      } catch (fallbackError2) {
        console.error('[PDF Extractor] All fallback attempts failed');
        throw new Error(`Failed to extract text from PDF. The file may be corrupted, password-protected, or contain only images. Try re-saving the PDF or using a different file. Original error: ${error.message}`);
      }
    }
  }
};

