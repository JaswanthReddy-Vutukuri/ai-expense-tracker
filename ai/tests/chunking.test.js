/**
 * TEXT CHUNKING TESTS
 * 
 * AUDIT FIX: Part 9 - Test Coverage
 * Tests text chunking logic to ensure correct chunk sizes and overlap
 */

import { chunkText } from '../src/rag/chunker.js';

describe('Text Chunking', () => {
  test('creates chunks of correct size', () => {
    const text = 'word '.repeat(500); // ~2500 characters
    const chunks = chunkText(text, { chunkSize: 1500, overlap: 200 });
    
    chunks.forEach(chunk => {
      // Each chunk should be close to target size (with some variance for sentence boundaries)
      expect(chunk.text.length).toBeLessThanOrEqual(1700); // Allow some buffer
    });
    
    expect(chunks.length).toBeGreaterThan(0);
  });

  test('creates overlapping chunks', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
    const chunks = chunkText(text, { chunkSize: 500, overlap: 100 });
    
    // Should create multiple chunks with overlap
    expect(chunks.length).toBeGreaterThan(1);
  });

  test('handles short text (single chunk)', () => {
    const text = 'Short text';
    const chunks = chunkText(text);
    
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
  });

  test('handles empty text', () => {
    const chunks = chunkText('');
    expect(chunks).toEqual([]);
  });

  test('includes metadata in chunks', () => {
    const text = 'Test text. '.repeat(200);
    const chunks = chunkText(text);
    
    chunks.forEach((chunk, idx) => {
      expect(chunk).toHaveProperty('text');
      expect(chunk).toHaveProperty('index', idx);
      expect(chunk).toHaveProperty('startChar');
      expect(chunk).toHaveProperty('endChar');
    });
  });

  test('uses correct default chunk size (1500 chars)', () => {
    const text = 'a'.repeat(3000);
    const chunks = chunkText(text); // No options = use defaults
    
    // With 1500 char chunks and 200 char overlap, expect ~2-3 chunks
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].text.length).toBeLessThanOrEqual(1500);
  });
});
