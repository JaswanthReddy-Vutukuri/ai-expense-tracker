/**
 * CACHE MANAGER TESTS
 */

import CacheManager, { 
  EmbeddingsCache, 
  SearchCache, 
  AgentResultsCache 
} from '../../src/utils/cache/cacheManager.js';

describe('CacheManager', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheManager({ ttl: 1000, maxSize: 3 });
  });

  describe('Basic Operations', () => {
    test('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    test('should return null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    test('should check if key exists', () => {
      cache.set('exists', 'value');
      expect(cache.has('exists')).toBe(true);
      expect(cache.has('notexists')).toBe(false);
    });

    test('should clear entire cache', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('TTL Management', () => {
    test('should expire entries after TTL', async () => {
      const shortCache = new CacheManager({ ttl: 100 });
      shortCache.set('temp', 'data');
      expect(shortCache.get('temp')).toBe('data');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(shortCache.get('temp')).toBeNull();
    });

    test('should support custom TTL per entry', async () => {
      cache.set('long', 'data', 10000);
      cache.set('short', 'temp', 50);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cache.get('long')).toBe('data');
      expect(cache.get('short')).toBeNull();
    });
  });

  describe('Size Management', () => {
    test('should evict LRU items when full', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      expect(cache.cache.size).toBe(3);
      
      // Access 'a' to make it recently used
      cache.get('a');
      
      // Add new item - should evict 'b' (LRU)
      cache.set('d', 4);
      expect(cache.cache.size).toBe(3);
      expect(cache.get('b')).toBeNull();
      expect(cache.get('a')).toBe(1);
    });
  });

  describe('Statistics', () => {
    test('should track hit/miss rates', () => {
      cache.set('key', 'value');
      cache.get('key');      // hit
      cache.get('missing');  // miss
      cache.get('key');      // hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe('66.67%');
    });

    test('should track evictions', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // triggers eviction

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });
  });

  describe('Pattern Invalidation', () => {
    test('should invalidate entries matching pattern', () => {
      cache.set('user:1:data', 'a');
      cache.set('user:2:data', 'b');
      cache.set('cache:key', 'c');

      const invalidated = cache.invalidatePattern('user:.*');
      expect(invalidated).toBe(2);
      expect(cache.get('user:1:data')).toBeNull();
      expect(cache.get('user:2:data')).toBeNull();
      expect(cache.get('cache:key')).toBe('c');
    });
  });
});

describe('EmbeddingsCache', () => {
  let cache;

  beforeEach(() => {
    cache = new EmbeddingsCache();
  });

  test('should cache embeddings by text and model', () => {
    const text = 'hello world';
    const embedding = [0.1, 0.2, 0.3];

    cache.setEmbedding(text, embedding, 'gpt-3.5');
    const cached = cache.getEmbedding(text, 'gpt-3.5');
    expect(cached).toEqual(embedding);
  });

  test('should differentiate by model', () => {
    const text = 'test';
    const embedding1 = [0.1, 0.2];
    const embedding2 = [0.3, 0.4];

    cache.setEmbedding(text, embedding1, 'model-a');
    cache.setEmbedding(text, embedding2, 'model-b');

    expect(cache.getEmbedding(text, 'model-a')).toEqual(embedding1);
    expect(cache.getEmbedding(text, 'model-b')).toEqual(embedding2);
  });
});

describe('SearchCache', () => {
  let cache;

  beforeEach(() => {
    cache = new SearchCache();
  });

  test('should cache search results per user', () => {
    const query = 'expenses in january';
    const results = [{ id: 1, amount: 100 }];

    cache.setSearchResult(query, results, 123);
    const cached = cache.getSearchResult(query, 123);
    expect(cached).toEqual(results);
  });

  test('should isolate results by user', () => {
    const query = 'same query';
    const results1 = [{ id: 1 }];
    const results2 = [{ id: 2 }];

    cache.setSearchResult(query, results1, 123);
    cache.setSearchResult(query, results2, 456);

    expect(cache.getSearchResult(query, 123)).toEqual(results1);
    expect(cache.getSearchResult(query, 456)).toEqual(results2);
  });
});

describe('AgentResultsCache', () => {
  let cache;

  beforeEach(() => {
    cache = new AgentResultsCache();
  });

  test('should cache agent results with entities', () => {
    const intention = 'add_expense';
    const entities = { amount: 100, category: 'food' };
    const result = { success: true, expenseId: 123 };

    cache.setResult(intention, entities, result, 456);
    const cached = cache.getResult(intention, entities, 456);
    expect(cached).toEqual(result);
  });
});
