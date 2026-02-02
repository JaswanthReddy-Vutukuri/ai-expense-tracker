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
   * Toggle chat window open/close
   */
  toggleChat(): void {
    this.isOpen.set(!this.isOpen());
    if (this.isOpen()) {
      this.scrollToBottom();
    }
  }

  /**
   * Send user message to AI
   */
  sendMessage(): void {
    const message = this.userInput.trim();
    if (!message || this.isLoading()) {
      return;
    }

    // Add user message to chat
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    this.messages.set([...this.messages(), userMessage]);
    
    // Clear input and error
    this.userInput = '';
    this.errorMessage.set(null);
    this.isLoading.set(true);
    this.scrollToBottom();

    // Call AI service
    this.aiChatService.sendMessage(message).subscribe({
      next: (response) => {
        const aiMessage: ChatMessage = {
          role: 'assistant',
          content: response.reply,
          timestamp: new Date()
        };
        this.messages.set([...this.messages(), aiMessage]);
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
    this.messages.set([...this.messages(), uploadMessage]);
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
        this.messages.set([...this.messages(), successMessage]);
        
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
        this.messages.set([...this.messages(), errorMessage]);
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
}
