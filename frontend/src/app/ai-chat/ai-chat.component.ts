import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AiChatService, ChatMessage } from '../services/ai-chat.service';

@Component({
  selector: 'app-ai-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule
  ],
  templateUrl: './ai-chat.component.html',
  styleUrls: ['./ai-chat.component.scss']
})
export class AiChatComponent {
  // Configuration
  private readonly MAX_HISTORY_MESSAGES = 20; // Keep last 10 exchanges (20 messages)
  private readonly STORAGE_KEY = 'ai-expense-tracker-chat-history';
  
  // UI state
  isOpen = signal(false);
  isLoading = signal(false);
  isUploading = signal(false);
  errorMessage = signal<string | null>(null);
  
  // Chat state
  messages = signal<ChatMessage[]>([]);
  userInput = '';
  
  // Document upload state
  uploadedDocuments = signal<string[]>([]);

  constructor(private aiChatService: AiChatService) {}

  /**
   * Initialize component and load saved chat history
   */
  ngOnInit(): void {
    this.loadChatHistory();
  }

  /**
   * Toggle chat window open/close
   */
  toggleChat(): void {
    this.isOpen.set(!this.isOpen());
    if (this.isOpen()) {
      this.scrollToBottom();
    }
  }

  /**
   * Send user message to AI with conversation history
   */
  sendMessage(): void {
    const message = this.userInput.trim();
    if (!message || this.isLoading()) {
      return;
    }

    // Prepare conversation history BEFORE adding current message
    // History should contain only PREVIOUS messages, not the current one
    const allMessages = this.messages();
    const recentMessages = allMessages.slice(-this.MAX_HISTORY_MESSAGES);
    const history = recentMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    console.log(`[Chat] Sending message with ${history.length}/${allMessages.length} messages as history (excluding current)`);

    // Add user message to chat AFTER preparing history
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    const updatedMessages = [...this.messages(), userMessage];
    this.messages.set(updatedMessages);
    this.saveChatHistory(updatedMessages);
    
    // Clear input and error
    this.userInput = '';
    this.errorMessage.set(null);
    this.isLoading.set(true);
    this.scrollToBottom();

    // Call AI service with history (excluding current message)
    this.aiChatService.sendMessage(message, history).subscribe({
      next: (response) => {
        // Store full response (with hidden metadata) for history
        // But display cleaned version to user
        const fullContent = response.reply;
        const displayContent = this.cleanPendingActionMarker(fullContent);
        
        const aiMessage: ChatMessage = {
          role: 'assistant',
          content: fullContent, // Store full content with metadata for next turn
          timestamp: new Date()
        };
        const updatedMessages = [...this.messages(), aiMessage];
        this.messages.set(updatedMessages);
        this.saveChatHistory(updatedMessages);
        this.isLoading.set(false);
        this.scrollToBottom();
      },
      error: (error) => {
        this.isLoading.set(false);
        
        // Handle different error types
        if (error.status === 401) {
          this.errorMessage.set('Session expired. Please log in again.');
        } else if (error.status >= 500) {
          this.errorMessage.set('AI service is temporarily unavailable. Please try again later.');
        } else if (error.error?.message) {
          this.errorMessage.set(error.error.message);
        } else {
          this.errorMessage.set('Failed to send message. Please try again.');
        }
      }
    });
  }

  /**
   * Handle Enter key press
   */
  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  /**
   * Scroll chat to bottom
   */
  private scrollToBottom(): void {
    setTimeout(() => {
      const chatBody = document.querySelector('.chat-messages');
      if (chatBody) {
        chatBody.scrollTop = chatBody.scrollHeight;
      }
    }, 100);
  }

  /**
   * Clear error message
   */
  clearError(): void {
    this.errorMessage.set(null);
  }

  /**
   * Trigger file upload dialog
   */
  triggerFileUpload(): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf';
    fileInput.onchange = (event: any) => {
      const file = event.target?.files?.[0];
      if (file) {
        this.uploadDocument(file);
      }
    };
    fileInput.click();
  }

  /**
   * Upload PDF document for RAG
   */
  uploadDocument(file: File): void {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.errorMessage.set('Please upload a PDF file');
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      this.errorMessage.set('File too large. Maximum size is 10MB');
      return;
    }

    this.isUploading.set(true);
    this.errorMessage.set(null);

    // Add upload status message
    const uploadMessage: ChatMessage = {
      role: 'assistant',
      content: `📄 Uploading "${file.name}"...`,
      timestamp: new Date()
    };
    const updatedMessages = [...this.messages(), uploadMessage];
    this.messages.set(updatedMessages);
    this.saveChatHistory(updatedMessages);
    this.scrollToBottom();

    // Get optional message from input
    const messageText = this.userInput.trim();

    this.aiChatService.uploadDocument(file, messageText || undefined).subscribe({
      next: (response) => {
        this.isUploading.set(false);
        
        // Add document to uploaded list
        this.uploadedDocuments.set([...this.uploadedDocuments(), file.name]);

        // Update message with success
        const successMessage: ChatMessage = {
          role: 'assistant',
          content: `✅ Successfully processed "${file.name}" (${response.document.numChunks} chunks from ${response.document.numPages} pages). You can now ask questions about this document!`,
          timestamp: new Date()
        };
        const updatedMessages = [...this.messages(), successMessage];
        this.messages.set(updatedMessages);
        this.saveChatHistory(updatedMessages);
        
        // If there was a message with the upload, process it
        if (messageText) {
          this.userInput = ''; // Clear input
          this.sendMessage(); // This will send the message that was typed
        }
        
        this.scrollToBottom();
      },
      error: (error) => {
        this.isUploading.set(false);
        
        const errorMsg = error.error?.message || 'Failed to upload document';
        this.errorMessage.set(errorMsg);
        
        // Update message with error
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: `❌ Failed to upload "${file.name}": ${errorMsg}`,
          timestamp: new Date()
        };
        const updatedMessages = [...this.messages(), errorMessage];
        this.messages.set(updatedMessages);
        this.saveChatHistory(updatedMessages);
      }
    });
  }

  /**
   * Remove uploaded document (visual only)
   */
  removeDocument(filename: string): void {
    this.uploadedDocuments.set(
      this.uploadedDocuments().filter(doc => doc !== filename)
    );
  }

  /**
   * Save chat history to localStorage
   * Includes error handling for quota exceeded or disabled storage
   */
  private saveChatHistory(messages: ChatMessage[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(messages));
      console.log(`[Chat] Saved ${messages.length} messages to localStorage`);
    } catch (error) {
      // Handle localStorage errors (quota exceeded, disabled, etc.)
      console.warn('[Chat] Failed to save history to localStorage:', error);
      
      // If quota exceeded, try saving last 10 messages only
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        try {
          const recentMessages = messages.slice(-10);
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentMessages));
          console.log('[Chat] Saved recent 10 messages after quota error');
        } catch (retryError) {
          console.error('[Chat] Failed to save even truncated history');
        }
      }
    }
  }

  /**
   * Load chat history from localStorage on component init
   */
  private loadChatHistory(): void {
    try {
      const savedHistory = localStorage.getItem(this.STORAGE_KEY);
      if (savedHistory) {
        const messages = JSON.parse(savedHistory) as ChatMessage[];
        
        // Validate loaded data
        if (Array.isArray(messages) && messages.length > 0) {
          // Restore Date objects for timestamps
          const restoredMessages = messages.map(msg => ({
            ...msg,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
          }));
          
          this.messages.set(restoredMessages);
          console.log(`[Chat] Loaded ${messages.length} messages from localStorage`);
          
          // Scroll to bottom after loading history
          setTimeout(() => this.scrollToBottom(), 100);
        }
      }
    } catch (error) {
      console.warn('[Chat] Failed to load history from localStorage:', error);
      // Clear corrupted data
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Clear chat history (both in-memory and localStorage)
   */
  clearChatHistory(): void {
    this.messages.set([]);
    this.uploadedDocuments.set([]);
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('[Chat] Cleared chat history');
  }
  /**
   * Remove hidden pending action markers from message content for display
   * Markers format: <!--PENDING_ACTION:{json}-->
   */
  private cleanPendingActionMarker(content: string): string {
    return content.replace(/<!--PENDING_ACTION:[\s\S]+?-->/g, '').trim();
  }

  /**
   * Get display content for a message (removes hidden metadata)
   */
  getDisplayContent(message: ChatMessage): string {
    return this.cleanPendingActionMarker(message.content);
  }}
