/**
 * DEBUG & OBSERVABILITY ROUTES
 * 
 * Purpose:
 * - Provides inspection endpoints for RAG system internals
 * - Enables testing and debugging of vector search
 * - Supports demo and visualization requirements
 * 
 * Why it exists:
 * - Essential for development and troubleshooting
 * - Allows inspection of chunks, embeddings, and search
 * - Provides metrics for system health monitoring
 * 
 * Architecture fit:
 * - Standalone debug routes under /ai/debug
 * - Read-only access to internal state
 * - Should be protected in production
 * 
 * Endpoints:
 * - GET /ai/debug/stats - Vector store statistics
 * - GET /ai/debug/chunks - List all document chunks
 * - GET /ai/debug/search - Test similarity search
 * - GET /ai/debug/documents - List stored documents
 * - POST /ai/debug/compare-test - Test comparison engine
 */

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getVectorStoreStats, getAllChunks, listDocuments } from '../rag/vectorStore.js';
import { searchSimilarChunks, hybridSearch, cosineSimilarity } from '../rag/search.js';
import { compareExpenses, generateSummaryReport } from '../comparison/expenseComparator.js';
import { generateEmbedding, getEmbeddingDimension } from '../rag/embeddings.js';

const router = express.Router();

/**
 * GET /ai/debug/stats
 * Returns vector store statistics
 * REQUIRES AUTHENTICATION: userId must be present
 */
router.get('/debug/stats', authMiddleware, async (req, res) => {
  try {
    // Enforce authentication in debug routes
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Debug endpoints require valid JWT token with userId'
      });
    }
    const stats = getVectorStoreStats();
    
    res.json({
      success: true,
      stats: {
        ...stats,
        embeddingDimension: getEmbeddingDimension(),
        systemInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime()
        },
        currentUserId: userId
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /ai/debug/chunks
 * Lists all document chunks (without embeddings to save bandwidth)
 * Query params: limit, documentId
 * REQUIRES AUTHENTICATION: userId must be present
 */
router.get('/debug/chunks', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Debug endpoints require valid JWT token with userId'
      });
    }
    const { limit = 50, documentId } = req.query;
    
    let chunks = getAllChunks(userId);
    
    // Filter by document if specified
    if (documentId) {
      chunks = chunks.filter(c => c.documentId === documentId);
    }
    
    // Limit results
    const limitedChunks = chunks.slice(0, parseInt(limit));
    
    // Remove embeddings to reduce payload size
    const chunksWithoutEmbeddings = limitedChunks.map(chunk => {
      const { embedding, ...rest } = chunk;
      return {
        ...rest,
        embeddingSize: embedding?.length || 0,
        hasEmbedding: !!embedding
      };
    });
    
    res.json({
      success: true,
      total: chunks.length,
      returned: chunksWithoutEmbeddings.length,
      chunks: chunksWithoutEmbeddings,
      userId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /ai/debug/search
 * Tests similarity search
 * Query params: q (query), topK, mode (semantic|hybrid)
 * REQUIRES AUTHENTICATION: userId must be present
 */
router.get('/debug/search', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Debug endpoints require valid JWT token with userId'
      });
    }
    const { q: query, topK = 5, mode = 'semantic' } = req.query;
    
    if (!query) {
      return res.status(400).json({
        error: 'Query parameter "q" is required',
        example: '/ai/debug/search?q=groceries&topK=3'
      });
    }
    
    console.log(`[Debug Search] Query: "${query}", Mode: ${mode}, TopK: ${topK}, UserId: ${userId}`);
    
    const startTime = Date.now();
    
    let results;
    if (mode === 'hybrid') {
      results = await hybridSearch(query, parseInt(topK), { userId });
    } else {
      results = await searchSimilarChunks(query, userId, parseInt(topK));
    }
    
    const duration = Date.now() - startTime;
    
    res.json({
      success: true,
      query,
      mode,
      topK: parseInt(topK),
      resultsCount: results.length,
      durationMs: duration,
      userId,
      results: results.map(r => ({
        text: r.text.substring(0, 200) + (r.text.length > 200 ? '...' : ''),
        similarity: r.similarity,
        semanticScore: r.semanticScore,
        keywordScore: r.keywordScore,
        filename: r.filename,
        chunkIndex: r.chunkIndex
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /ai/debug/documents
 * Lists all stored documents (filtered by user)
 * REQUIRES AUTHENTICATION: userId must be present
 */
router.get('/debug/documents', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Debug endpoints require valid JWT token with userId'
      });
    }
    let documents = listDocuments();
    
    // Filter by userId if available
    if (userId !== null) {
      documents = documents.filter(doc => doc.metadata?.userId === userId);
    }
    
    res.json({
      success: true,
      count: documents.length,
      documents,
      userId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /ai/debug/compare-test
 * Tests expense comparison engine with sample data
 * Body: { pdfExpenses: [], appExpenses: [] }
 */
router.post('/debug/compare-test', authMiddleware, async (req, res) => {
  try {
    const { pdfExpenses, appExpenses } = req.body;
    
    if (!Array.isArray(pdfExpenses) || !Array.isArray(appExpenses)) {
      return res.status(400).json({
        error: 'Body must contain "pdfExpenses" and "appExpenses" arrays',
        example: {
          pdfExpenses: [{ amount: 100, description: 'Coffee', date: '2026-02-01' }],
          appExpenses: [{ amount: 100, category_name: 'Food', date: '2026-02-01' }]
        }
      });
    }
    
    const comparisonResult = compareExpenses(pdfExpenses, appExpenses);
    const summaryReport = generateSummaryReport(comparisonResult);
    
    res.json({
      success: true,
      comparison: comparisonResult,
      summaryReport
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /ai/debug/embedding-test
 * Tests embedding generation
 * Query params: text
 */
router.get('/debug/embedding-test', authMiddleware, async (req, res) => {
  try {
    const { text } = req.query;
    
    if (!text) {
      return res.status(400).json({
        error: 'Query parameter "text" is required',
        example: '/ai/debug/embedding-test?text=hello%20world'
      });
    }
    
    const startTime = Date.now();
    const embedding = await generateEmbedding(text);
    const duration = Date.now() - startTime;
    
    // Calculate some statistics
    const mean = embedding.reduce((sum, val) => sum + val, 0) / embedding.length;
    const variance = embedding.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / embedding.length;
    const stdDev = Math.sqrt(variance);
    
    res.json({
      success: true,
      text,
      dimension: embedding.length,
      durationMs: duration,
      statistics: {
        mean: mean.toFixed(6),
        stdDev: stdDev.toFixed(6),
        min: Math.min(...embedding).toFixed(6),
        max: Math.max(...embedding).toFixed(6)
      },
      sample: embedding.slice(0, 10).map(v => v.toFixed(6))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /ai/debug/similarity-test
 * Tests cosine similarity between two texts
 * Body: { text1, text2 }
 */
router.post('/debug/similarity-test', authMiddleware, async (req, res) => {
  try {
    const { text1, text2 } = req.body;
    
    if (!text1 || !text2) {
      return res.status(400).json({
        error: 'Body must contain "text1" and "text2"',
        example: { text1: 'coffee expense', text2: 'coffee purchase' }
      });
    }
    
    const [embedding1, embedding2] = await Promise.all([
      generateEmbedding(text1),
      generateEmbedding(text2)
    ]);
    
    const similarity = cosineSimilarity(embedding1, embedding2);
    
    res.json({
      success: true,
      text1,
      text2,
      similarity: similarity.toFixed(6),
      interpretation: similarity > 0.9 ? 'Very Similar' :
                     similarity > 0.7 ? 'Similar' :
                     similarity > 0.5 ? 'Somewhat Similar' :
                     'Different',
      dimensions: {
        text1: embedding1.length,
        text2: embedding2.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /ai/debug/embedding-info
 * Shows information about stored embeddings vs current model
 * REQUIRES AUTHENTICATION: userId must be present
 */
router.get('/debug/embedding-info', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Debug endpoints require valid JWT token with userId'
      });
    }
    const chunks = getAllChunks(userId);
    
    if (chunks.length === 0) {
      return res.json({
        success: true,
        message: 'No documents uploaded yet',
        currentModel: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',
        expectedDimension: getEmbeddingDimension()
      });
    }
    
    // Check dimensions of stored embeddings
    const dimensions = chunks.map(c => c.embedding?.length).filter(Boolean);
    const uniqueDimensions = [...new Set(dimensions)];
    const mostCommon = dimensions.reduce((acc, dim) => {
      acc[dim] = (acc[dim] || 0) + 1;
      return acc;
    }, {});
    
    const currentExpected = getEmbeddingDimension();
    const storedDimension = uniqueDimensions[0];
    const mismatch = storedDimension !== currentExpected;
    
    res.json({
      success: true,
      currentModel: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',
      expectedDimension: currentExpected,
      storedDimensions: {
        unique: uniqueDimensions,
        distribution: mostCommon,
        totalChunks: dimensions.length
      },
      dimensionMismatch: mismatch,
      recommendation: mismatch 
        ? `⚠️ MISMATCH DETECTED: Your stored embeddings have ${storedDimension} dimensions but current model expects ${currentExpected}. Please re-upload your documents to fix search.`
        : '✅ Embeddings are compatible with current model'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /ai/debug/health
 * Health check with system diagnostics
 */
router.get('/debug/health', async (req, res) => {
  try {
    const stats = getVectorStoreStats();
    
    // Check embedding dimensions in store
    let storedDimension = null;
    const chunks = listDocuments();
    if (chunks.length > 0) {
      const firstDoc = chunks[0];
      // Try to get dimension from first chunk if available
      storedDimension = 'unknown';
    }
    
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        vectorStore: {
          status: 'operational',
          documentsCount: stats.totalDocuments,
          chunksCount: stats.totalChunks,
          storedEmbeddingDimension: storedDimension
        },
        embeddings: {
          status: 'operational',
          model: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',
          expectedDimension: getEmbeddingDimension(),
          baseURL: process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1'
        },
        llm: {
          status: 'operational',
          model: process.env.LLM_MODEL || 'gpt-4o-mini'
        }
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
        },
        uptime: Math.round(process.uptime()) + ' seconds'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;
