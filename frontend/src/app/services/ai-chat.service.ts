import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];  // Optional conversation history for context
}

export interface ChatResponse {
  reply: string;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  document: {
    id: string;
    filename: string;
    numPages: number;
    numChunks: number;
    textLength: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AiChatService {
  // AI service runs on port 3001
  private aiUrl = 'http://localhost:3001/ai';

  constructor(private http: HttpClient) {}

  /**
   * Send a message to the AI chat endpoint with conversation history
   * JWT token will be automatically attached by the JWT interceptor
   * @param message Current user message
   * @param history Optional array of previous messages for context
   */
  sendMessage(message: string, history?: ChatMessage[]): Observable<ChatResponse> {
    const payload: ChatRequest = { message, history };
    return this.http.post<ChatResponse>(`${this.aiUrl}/chat`, payload);
  }

  /**
   * Upload a PDF document for RAG processing
   * @param file PDF file to upload
   * @param message Optional message to send with the upload
   * @returns Upload response with chunk count
   */
  uploadDocument(file: File, message?: string): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file); // Backend expects 'file' field name
    if (message) {
      formData.append('message', message); // Optional message
    }
    return this.http.post<UploadResponse>(`${this.aiUrl}/upload`, formData);
  }
}
