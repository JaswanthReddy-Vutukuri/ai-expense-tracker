/**
 * CONVERSATION MEMORY TESTS
 */

import { ConversationMemory, ConversationManager } from '../../src/utils/memory/conversationMemory.js';

describe('ConversationMemory', () => {
  let memory;

  beforeEach(() => {
    memory = new ConversationMemory({ maxMessages: 5 });
  });

  describe('Message Management', () => {
    test('should add user message', () => {
      const msg = memory.addMessage('user', 'hello');
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('hello');
      expect(msg.threadId).toBe(memory.threadId);
    });

    test('should add assistant message', () => {
      const msg = memory.addMessage('assistant', 'response');
      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('response');
    });

    test('should maintain message metadata', () => {
      const metadata = { intent: 'add_expense', cost: 0.001 };
      const msg = memory.addMessage('user', 'text', metadata);
      expect(msg.metadata).toEqual(metadata);
    });
  });

  describe('Context Management', () => {
    test('should get recent context', () => {
      memory.addMessage('user', 'message 1');
      memory.addMessage('assistant', 'response 1');
      memory.addMessage('user', 'message 2');

      const context = memory.getContext(2);
      expect(context).toHaveLength(2);
      expect(context[0].content).toBe('response 1');
      expect(context[1].content).toBe('message 2');
    });

    test('should get full history', () => {
      memory.addMessage('user', 'msg1');
      memory.addMessage('assistant', 'response');

      const history = memory.getHistory();
      expect(history.messageCount).toBe(2);
      expect(history.threadId).toBe(memory.threadId);
      expect(history.messages).toHaveLength(2);
    });
  });

  describe('Message Pruning', () => {
    test('should prune messages exceeding maxMessages', () => {
      for (let i = 0; i < 10; i++) {
        memory.addMessage('user', `message ${i}`);
      }

      expect(memory.messages.length).toBe(5);
      expect(memory.messages[0].content).toBe('message 5');
    });
  });

  describe('Search', () => {
    test('should search messages by content', () => {
      memory.addMessage('user', 'I spent 100 on food');
      memory.addMessage('assistant', 'You added an expense');
      memory.addMessage('user', 'What did I spend on food?');

      const results = memory.search('food');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('food');
    });

    test('should rank by relevance', () => {
      memory.addMessage('user', 'food');
      memory.addMessage('assistant', 'mention of food here');
      memory.addMessage('user', 'food food food');

      const results = memory.search('food', 3);
      expect(results[0].content).toContain('food food food');
    });
  });

  describe('Summary', () => {
    test('should generate summary from messages', () => {
      memory.addMessage('user', 'add 100 for lunch', { intent: 'add_expense' });
      memory.addMessage('assistant', 'Added expense');
      memory.addMessage('user', 'list expenses', { intent: 'list_expenses' });

      const summary = memory.getSummary();
      expect(summary.userMessages).toBe(2);
      expect(summary.assistantMessages).toBe(1);
      expect(summary.intents).toContain('add_expense');
    });
  });

  describe('Import/Export', () => {
    test('should export conversation', () => {
      memory.addMessage('user', 'test');
      const exported = memory.export();

      expect(exported.threadId).toBe(memory.threadId);
      expect(exported.messages).toHaveLength(1);
      expect(exported.messageCount).toBe(1);
    });

    test('should import conversation', () => {
      const memory1 = new ConversationMemory();
      memory1.addMessage('user', 'message 1');
      const exported = memory1.export();

      const memory2 = new ConversationMemory();
      memory2.import(exported);

      expect(memory2.threadId).toBe(memory1.threadId);
      expect(memory2.messages).toHaveLength(1);
      expect(memory2.messages[0].content).toBe('message 1');
    });
  });

  describe('Clear', () => {
    test('should clear all messages', () => {
      memory.addMessage('user', 'msg1');
      memory.addMessage('assistant', 'response');
      
      memory.clear();
      expect(memory.messages).toHaveLength(0);
      expect(memory.summary).toBeNull();
    });
  });
});

describe('ConversationManager', () => {
  let manager;

  beforeEach(() => {
    manager = new ConversationManager();
  });

  describe('User Conversations', () => {
    test('should create conversation for new user', () => {
      const conv = manager.getConversation(123);
      expect(conv).toBeDefined();
      expect(conv.threadId).toContain('user_123');
    });

    test('should reuse conversation for same user', () => {
      const conv1 = manager.getConversation(123);
      const conv2 = manager.getConversation(123);
      expect(conv1.threadId).toBe(conv2.threadId);
    });

    test('should isolate conversations by user', () => {
      const conv1 = manager.getConversation(123);
      const conv2 = manager.getConversation(456);
      expect(conv1.threadId).not.toBe(conv2.threadId);
    });
  });

  describe('Message Adding', () => {
    test('should add message to user conversation', () => {
      manager.addMessage(123, 'user', 'hello');
      manager.addMessage(123, 'assistant', 'hi');

      const conv = manager.getConversation(123);
      expect(conv.messages).toHaveLength(2);
    });
  });

  describe('Thread Management', () => {
    test('should get specific thread by ID', () => {
      const conv1 = manager.getConversation(123);
      const threadId = conv1.threadId;

      const conv2 = manager.getConversation(999, threadId);
      expect(conv2.threadId).toBe(threadId);
    });

    test('should delete conversation', () => {
      const conv = manager.getConversation(123);
      manager.deleteConversation(conv.threadId);

      const newConv = manager.getConversation(123);
      expect(newConv.threadId).not.toBe(conv.threadId);
    });
  });

  describe('List & Export', () => {
    test('should list conversations', () => {
      manager.addMessage(123, 'user', 'msg1');
      manager.addMessage(456, 'user', 'msg2');

      const conversations = manager.listConversations();
      expect(conversations.length).toBe(2);
    });

    test('should export all conversations', () => {
      manager.addMessage(123, 'user', 'msg1');
      manager.addMessage(456, 'user', 'msg2');

      const exported = manager.exportAll();
      expect(exported).toHaveLength(2);
      expect(exported[0].messageCount).toBeGreaterThan(0);
    });
  });
});
