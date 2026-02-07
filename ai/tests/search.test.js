/**
 * VECTOR SEARCH AND USER ISOLATION TESTS
 * 
 * Test Coverage
 * Tests user isolation in vector search (CRITICAL security test)
 */

import { cosineSimilarity } from '../src/rag/search.js';
import { storeDocument, getAllChunks, clearVectorStore } from '../src/rag/vectorStore.js';

describe('Vector Search - Cosine Similarity', () => {
  test('calculates similarity for identical vectors', () => {
    const vec1 = [1, 2, 3];
    const vec2 = [1, 2, 3];
    const similarity = cosineSimilarity(vec1, vec2);
    
    expect(similarity).toBeCloseTo(1.0, 5);
  });

  test('calculates similarity for orthogonal vectors', () => {
    const vec1 = [1, 0, 0];
    const vec2 = [0, 1, 0];
    const similarity = cosineSimilarity(vec1, vec2);
    
    expect(similarity).toBeCloseTo(0.0, 5);
  });

  test('calculates similarity for opposite vectors', () => {
    const vec1 = [1, 0, 0];
    const vec2 = [-1, 0, 0];
    const similarity = cosineSimilarity(vec1, vec2);
    
    expect(similarity).toBeCloseTo(-1.0, 5);
  });

  test('throws error for mismatched dimensions', () => {
    const vec1 = [1, 2, 3];
    const vec2 = [1, 2];
    
    expect(() => cosineSimilarity(vec1, vec2)).toThrow('same dimension');
  });

  test('handles zero vectors', () => {
    const vec1 = [0, 0, 0];
    const vec2 = [1, 2, 3];
    const similarity = cosineSimilarity(vec1, vec2);
    
    expect(similarity).toBe(0);
  });
});

describe('Vector Store - User Isolation (CRITICAL SECURITY TEST)', () => {
  beforeEach(async () => {
    // Clear vector store before each test
    await clearVectorStore();
  });

  test('requires userId for storeDocument', async () => {
    await expect(async () => {
      await storeDocument({
        filename: 'test.pdf',
        chunks: [{ text: 'test', index: 0 }],
        embeddings: [[1, 2, 3]],
        // userId missing
      });
    }).rejects.toThrow('userId is required');
  });

  test('requires userId for getAllChunks', () => {
    expect(() => getAllChunks()).toThrow('userId is required');
  });

  test('filters chunks by userId (User A cannot see User B data)', async () => {
    // Store document for User A (userId=1)
    await storeDocument({
      filename: 'userA_expenses.pdf',
      chunks: [{ text: 'User A expense', index: 0, startChar: 0, endChar: 15 }],
      embeddings: [[1, 0, 0]],
      userId: 1
    });

    // Store document for User B (userId=2)
    await storeDocument({
      filename: 'userB_expenses.pdf',
      chunks: [{ text: 'User B expense', index: 0, startChar: 0, endChar: 15 }],
      embeddings: [[0, 1, 0]],
      userId: 2
    });

    // User A should only see their own chunks
    const userAChunks = getAllChunks(1);
    expect(userAChunks).toHaveLength(1);
    expect(userAChunks[0].text).toBe('User A expense');
    expect(userAChunks[0].filename).toBe('userA_expenses.pdf');

    // User B should only see their own chunks
    const userBChunks = getAllChunks(2);
    expect(userBChunks).toHaveLength(1);
    expect(userBChunks[0].text).toBe('User B expense');
    expect(userBChunks[0].filename).toBe('userB_expenses.pdf');

    // User C (no documents) should see nothing
    const userCChunks = getAllChunks(3);
    expect(userCChunks).toHaveLength(0);
  });

  test('stores userId in document metadata', async () => {
    const docId = await storeDocument({
      filename: 'test.pdf',
      chunks: [{ text: 'test chunk', index: 0, startChar: 0, endChar: 10 }],
      embeddings: [[1, 2, 3]],
      userId: 42
    });

    const chunks = getAllChunks(42);
    expect(chunks).toHaveLength(1);
    
    // Verify userId is stored correctly
    const doc = await import('../src/rag/vectorStore.js').then(m => m.getDocument(docId));
    expect(doc.metadata.userId).toBe(42);
  });
});
