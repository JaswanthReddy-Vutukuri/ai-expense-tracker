import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface VectorStoreStats {
  totalDocuments: number;
  totalChunks: number;
  totalExpenses: number;
  storageSize: number;
  embeddingDimension: number;
  systemInfo: {
    nodeVersion: string;
    platform: string;
    uptime: number;
  };
}

export interface ChunkInfo {
  id: string;
  documentId: string;
  text: string;
  chunkIndex: number;
  embeddingSize: number;
  hasEmbedding: boolean;
}

export interface DocumentInfo {
  id: string;
  filename: string;
  uploadedAt: string;
  userId: string;
  numChunks: number;
  totalLength: number;
}

export interface SearchResult {
  chunk: ChunkInfo;
  score: number;
  documentId: string;
}

@Injectable({
  providedIn: 'root'
})
export class DebugService {
  private aiUrl = 'http://localhost:3001/ai';

  constructor(private http: HttpClient) {}

  getStats(): Observable<{ success: boolean; stats: VectorStoreStats }> {
    return this.http.get<{ success: boolean; stats: VectorStoreStats }>(`${this.aiUrl}/debug/stats`);
  }

  getChunks(limit: number = 50, documentId?: string): Observable<{ success: boolean; total: number; returned: number; chunks: ChunkInfo[] }> {
    let url = `${this.aiUrl}/debug/chunks?limit=${limit}`;
    if (documentId) {
      url += `&documentId=${documentId}`;
    }
    return this.http.get<any>(url);
  }

  getDocuments(): Observable<{ success: boolean; documents: DocumentInfo[] }> {
    return this.http.get<any>(`${this.aiUrl}/debug/documents`);
  }

  searchChunks(query: string, limit: number = 10): Observable<{ success: boolean; results: SearchResult[] }> {
    return this.http.get<any>(`${this.aiUrl}/debug/search?q=${encodeURIComponent(query)}&topK=${limit}`);
  }

  getEmbeddingInfo(): Observable<any> {
    return this.http.get<any>(`${this.aiUrl}/debug/embedding-info`);
  }
}
