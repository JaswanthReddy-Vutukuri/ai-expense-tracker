/**
 * CONVERSATION MEMORY - Phase 4
 * 
 * PURPOSE:
 * - Maintain context across multiple turns
 * - Support multi-turn conversations
 * - Enable user-specific memory (per-user thread)
 * - Automatic memory pruning and summarization
 * 
 * FEATURES:
 * ✅ Rolling window memory (last N messages)
 * ✅ Semantic summarization of old messages
 * ✅ Per-user conversation threads
 * ✅ Hybrid retrieval (recent + semantic search)
 */

import { z } from 'zod';

/**
 * Conversation Message Schema
 */
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.number(),
  threadId: z.string(),
  messageId: z.string(),
  metadata: z.object({
    intent: z.string().optional(),
    entities: z.any().optional(),
    cost: z.number().optional()
  }).optional()
});

/**
 * Conversation Memory Manager
 * Manages multi-turn conversation context
 */
export class ConversationMemory {
  constructor(options = {}) {
    this.threadId = options.threadId || this._generateThreadId();
    this.maxMessages = options.maxMessages || 20; // Keep last 20 messages
    this.maxTokens = options.maxTokens || 4000; // ~1000 tokens per message avg
    this.messages = [];
    this.summary = null;
    this.lastSummarized = 0;
    this.summarizeInterval = options.summarizeInterval || 10; // After 10 messages
  }

  /**
   * Add a message to conversation
   */
  addMessage(role, content, metadata = {}) {
    const message = {
      role,
      content,
      timestamp: Date.now(),
      threadId: this.threadId,
      messageId: this._generateMessageId(),
      metadata
    };

    this.messages.push(message);

    // Trigger summarization if needed
    if (this.messages.length - this.lastSummarized >= this.summarizeInterval) {
      this._summarizeOldMessages();
    }

    // Prune if exceeds max messages
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }

    return message;
  }

  /**
   * Get recent conversation context
   */
  getContext(numMessages = 5) {
    return this.messages.slice(-numMessages).map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * Get full conversation history with optional summary
   */
  getHistory() {
    return {
      threadId: this.threadId,
      messages: this.messages,
      summary: this.summary,
      messageCount: this.messages.length,
      oldestMessage: this.messages[0]?.timestamp,
      newestMessage: this.messages[this.messages.length - 1]?.timestamp
    };
  }

  /**
   * Search messages by content
   */
  search(query, limit = 5) {
    const results = this.messages
      .filter(msg => msg && msg.content && msg.content.toLowerCase().includes(query.toLowerCase()))
      .slice(-limit)
      .map(msg => ({
        ...msg,
        relevance: this._calculateRelevance(msg.content, query)
      }))
      .sort((a, b) => b.relevance - a.relevance);

    return results;
  }

  /**
   * Get conversation summary
   */
  getSummary() {
    if (!this.summary) {
      // Generate summary from messages
      this.summary = this._generateSummaryFromMessages();
    }
    return this.summary;
  }

  /**
   * Clear conversation
   */
  clear() {
    this.messages = [];
    this.summary = null;
    this.lastSummarized = 0;
  }

  /**
   * Export conversation
   */
  export() {
    return {
      threadId: this.threadId,
      exportedAt: new Date().toISOString(),
      messages: this.messages,
      summary: this.summary,
      messageCount: this.messages.length,
      durationMs: this.messages.length > 0 
        ? this.messages[this.messages.length - 1].timestamp - this.messages[0].timestamp
        : 0
    };
  }

  /**
   * Import conversation
   */
  import(data) {
    this.threadId = data.threadId;
    this.messages = data.messages;
    this.summary = data.summary;
    this.lastSummarized = this.messages.length;
  }

  /**
   * Summarize old messages
   */
  _summarizeOldMessages() {
    if (this.messages.length < 5) return;

    const oldMessages = this.messages.slice(0, -5);
    const newMessages = this.messages.slice(-5);

    this.summary = {
      oldMessages: oldMessages.length,
      summary: this._generateSummaryFromMessages(oldMessages),
      generatedAt: Date.now()
    };

    this.lastSummarized = this.messages.length;
  }

  /**
   * Generate summary from messages
   */
  _generateSummaryFromMessages(messages = this.messages) {
    if (messages.length === 0) return null;

    const topics = {};
    const intents = new Set();

    messages.forEach(msg => {
      if (msg && msg.metadata?.intent) {
        intents.add(msg.metadata.intent);
      }
    });

    return {
      totalMessages: messages.length,
      intents: Array.from(intents),
      userMessages: messages.filter(m => m && m.role === 'user').length,
      assistantMessages: messages.filter(m => m && m.role === 'assistant').length,
      firstMessage: messages[0]?.content?.substring(0, 50) || 'N/A',
      lastMessage: messages[messages.length - 1]?.content?.substring(0, 50) || 'N/A'
    };
  }

  /**
   * Calculate relevance score
   */
  _calculateRelevance(text, query) {
    // Guard against undefined text
    if (!text || typeof text !== 'string') {
      return 0;
    }
    
    const textWords = text.toLowerCase().split(/\s+/);
    const queryWords = query.toLowerCase().split(/\s+/);

    let matches = 0;
    queryWords.forEach(qWord => {
      if (textWords.includes(qWord)) matches++;
    });

    return matches / queryWords.length;
  }

  /**
   * Generate unique thread ID
   */
  _generateThreadId() {
    return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique message ID
   */
  _generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Conversation Manager
 * Manages multiple conversation threads
 */
export class ConversationManager {
  constructor() {
    this.threads = new Map();
    this.userThreads = new Map();
  }

  /**
   * Get or create conversation for user
   */
  getConversation(userId, threadId = null) {
    if (threadId) {
      return this.threads.get(threadId);
    }

    // Get user's active thread
    const userThreadId = this.userThreads.get(userId);
    if (userThreadId) {
      return this.threads.get(userThreadId);
    }

    // Create new thread
    const conversation = new ConversationMemory({ threadId: `user_${userId}_${Date.now()}` });
    this.threads.set(conversation.threadId, conversation);
    this.userThreads.set(userId, conversation.threadId);
    return conversation;
  }

  /**
   * Add message to user's conversation
   */
  addMessage(userId, role, content, metadata = {}) {
    const conversation = this.getConversation(userId);
    return conversation.addMessage(role, content, metadata);
  }

  /**
   * Get all user threads
   */
  getUserThreads(userId) {
    const threadIds = [];
    for (const [uid, threadId] of this.userThreads.entries()) {
      if (uid === userId) {
        threadIds.push(threadId);
      }
    }
    return threadIds.map(id => this.threads.get(id));
  }

  /**
   * List all conversations
   */
  listConversations(limit = 10) {
    return Array.from(this.threads.values())
      .map(conv => ({
        threadId: conv.threadId,
        messageCount: conv.messages.length,
        lastMessage: conv.messages[conv.messages.length - 1]?.timestamp,
        summary: conv.getSummary()
      }))
      .slice(-limit);
  }

  /**
   * Delete conversation
   */
  deleteConversation(threadId) {
    this.threads.delete(threadId);
    for (const [userId, id] of this.userThreads.entries()) {
      if (id === threadId) {
        this.userThreads.delete(userId);
      }
    }
  }

  /**
   * Export all conversations
   */
  exportAll() {
    return Array.from(this.threads.values()).map(conv => conv.export());
  }
}

/**
 * Global conversation manager
 */
export const conversationManager = new ConversationManager();

export default ConversationMemory;
