import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { DebugService, VectorStoreStats, ChunkInfo, DocumentInfo } from '../services/debug.service';

@Component({
  selector: 'app-debug',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatTableModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule
  ],
  template: `
    <div class="debug-container">
      <h1>Debug & Observability Dashboard</h1>

      <!-- Stats Card -->
      <mat-card class="stats-card">
        <mat-card-header>
          <mat-card-title>Vector Store Statistics</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (embeddingInfo()) {
            @if (embeddingInfo()!.dimensionMismatch) {
              <div class="error-banner" style="margin-bottom: 20px; padding: 15px; background: #fff3cd; border-left: 4px solid #ff9800; border-radius: 4px;">
                <strong>⚠️ Embedding Model Mismatch Detected</strong>
                <p style="margin: 10px 0 0 0;">{{ embeddingInfo()!.recommendation }}</p>
              </div>
            }
          }
          @if (stats()) {
            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-label">Total Documents:</span>
                <span class="stat-value">{{ stats()!.totalDocuments }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Total Chunks:</span>
                <span class="stat-value">{{ stats()!.totalChunks }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Total Expenses:</span>
                <span class="stat-value">{{ stats()!.totalExpenses }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Embedding Dimension:</span>
                <span class="stat-value">{{ stats()!.embeddingDimension }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Node Version:</span>
                <span class="stat-value">{{ stats()!.systemInfo.nodeVersion }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Uptime:</span>
                <span class="stat-value">{{ formatUptime(stats()!.systemInfo.uptime) }}</span>
              </div>
            </div>
          } @else {
            <p>Loading...</p>
          }
        </mat-card-content>
        <mat-card-actions>
          <button mat-raised-button color="primary" (click)="loadStats()">Refresh Stats</button>
        </mat-card-actions>
      </mat-card>

      <!-- Documents Card -->
      <mat-card class="documents-card">
        <mat-card-header>
          <mat-card-title>Uploaded Documents</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (documents().length > 0) {
            <table mat-table [dataSource]="documents()" class="debug-table">
              <ng-container matColumnDef="filename">
                <th mat-header-cell *matHeaderCellDef>Filename</th>
                <td mat-cell *matCellDef="let doc">{{ doc.filename }}</td>
              </ng-container>
              <ng-container matColumnDef="numChunks">
                <th mat-header-cell *matHeaderCellDef>Chunks</th>
                <td mat-cell *matCellDef="let doc">{{ doc.numChunks }}</td>
              </ng-container>
              <ng-container matColumnDef="uploadedAt">
                <th mat-header-cell *matHeaderCellDef>Uploaded</th>
                <td mat-cell *matCellDef="let doc">{{ doc.uploadedAt | date:'short' }}</td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="documentColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: documentColumns;"></tr>
            </table>
          } @else {
            <p>No documents found. Upload a PDF to see data.</p>
          }
        </mat-card-content>
        <mat-card-actions>
          <button mat-raised-button color="primary" (click)="loadDocuments()">Refresh Documents</button>
        </mat-card-actions>
      </mat-card>

      <!-- Search Test Card -->
      <mat-card class="search-card">
        <mat-card-header>
          <mat-card-title>Test Similarity Search</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <mat-form-field class="search-field">
            <mat-label>Enter search query</mat-label>
            <input matInput [(ngModel)]="searchQuery" placeholder="e.g., groceries, hotel, food">
          </mat-form-field>
          <button mat-raised-button color="accent" (click)="testSearch()" [disabled]="!searchQuery">
            Search
          </button>

          @if (searchResults().length > 0) {
            <div class="search-results">
              <h3>Found {{ searchResults().length }} results:</h3>
              @for (result of searchResults(); track $index) {
                <div class="search-result-item">
                  <div class="result-score">Similarity: {{ result.similarity?.toFixed(4) || result.semanticScore?.toFixed(4) }}</div>
                  <div class="result-text">{{ result.text }}</div>
                  <div class="result-meta">File: {{ result.filename }}, Chunk: {{ result.chunkIndex }}</div>
                </div>
              }
            </div>
          }
        </mat-card-content>
      </mat-card>

      <!-- Chunks Preview Card -->
      <mat-card class="chunks-card">
        <mat-card-header>
          <mat-card-title>Document Chunks Preview (Last 10)</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (chunks().length > 0) {
            <p class="chunk-info">Showing {{ chunks().length }} of {{ totalChunks() }} total chunks</p>
            @for (chunk of chunks(); track chunk.id) {
              <div class="chunk-item">
                <div class="chunk-header">
                  <span class="chunk-id">ID: {{ chunk.id }}</span>
                  <span class="chunk-index">Chunk {{ chunk.chunkIndex }}</span>
                  <span class="chunk-embedding">Embedding: {{ chunk.embeddingSize }}d</span>
                </div>
                <div class="chunk-text">{{ chunk.text }}</div>
              </div>
            }
          } @else {
            <p>No chunks found.</p>
          }
        </mat-card-content>
        <mat-card-actions>
          <button mat-raised-button color="primary" (click)="loadChunks()">Refresh Chunks</button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .debug-container {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }

    h1 {
      margin-bottom: 20px;
    }

    mat-card {
      margin-bottom: 20px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 15px 0;
    }

    .stat-item {
      padding: 10px;
      background: #f5f5f5;
      border-radius: 4px;
    }

    .stat-label {
      display: block;
      font-size: 12px;
      color: #666;
      margin-bottom: 5px;
    }

    .stat-value {
      display: block;
      font-size: 24px;
      font-weight: bold;
      color: #333;
    }

    .debug-table {
      width: 100%;
      margin-top: 10px;
    }

    .search-field {
      width: 100%;
      margin-right: 10px;
    }

    .search-results {
      margin-top: 20px;
    }

    .search-result-item {
      padding: 15px;
      margin: 10px 0;
      background: #f9f9f9;
      border-left: 4px solid #3f51b5;
      border-radius: 4px;
    }

    .result-score {
      font-weight: bold;
      color: #3f51b5;
      margin-bottom: 5px;
    }

    .result-text {
      margin: 10px 0;
      line-height: 1.6;
    }

    .result-meta {
      font-size: 12px;
      color: #666;
    }

    .chunk-info {
      font-style: italic;
      color: #666;
      margin-bottom: 15px;
    }

    .chunk-item {
      padding: 12px;
      margin: 10px 0;
      background: #f9f9f9;
      border-radius: 4px;
      border: 1px solid #ddd;
    }

    .chunk-header {
      display: flex;
      gap: 15px;
      margin-bottom: 8px;
      font-size: 12px;
      color: #666;
    }

    .chunk-text {
      font-size: 14px;
      line-height: 1.5;
      color: #333;
    }
  `]
})
export class DebugComponent implements OnInit {
  stats = signal<VectorStoreStats | null>(null);
  documents = signal<DocumentInfo[]>([]);
  chunks = signal<ChunkInfo[]>([]);
  totalChunks = signal(0);
  searchResults = signal<any[]>([]);
  searchQuery = '';
  embeddingInfo = signal<any>(null);

  documentColumns = ['filename', 'numChunks', 'uploadedAt'];

  constructor(private debugService: DebugService) {}

  ngOnInit() {
    this.loadStats();
    this.loadDocuments();
    this.loadChunks();
    this.loadEmbeddingInfo();
  }

  loadStats() {
    this.debugService.getStats().subscribe({
      next: (response) => {
        this.stats.set(response.stats);
      },
      error: (error) => {
        console.error('Failed to load stats:', error);
      }
    });
  }

  loadDocuments() {
    this.debugService.getDocuments().subscribe({
      next: (response) => {
        this.documents.set(response.documents);
      },
      error: (error) => {
        console.error('Failed to load documents:', error);
      }
    });
  }

  loadChunks() {
    this.debugService.getChunks(10).subscribe({
      next: (response) => {
        this.chunks.set(response.chunks);
        this.totalChunks.set(response.total);
      },
      error: (error) => {
        console.error('Failed to load chunks:', error);
      }
    });
  }

  loadEmbeddingInfo() {
    this.debugService.getEmbeddingInfo().subscribe({
      next: (response) => {
        this.embeddingInfo.set(response);
        console.log('Embedding info:', response);
      },
      error: (error) => {
        console.error('Failed to load embedding info:', error);
      }
    });
  }

  testSearch() {
    if (!this.searchQuery.trim()) return;

    this.debugService.searchChunks(this.searchQuery, 10).subscribe({
      next: (response) => {
        this.searchResults.set(response.results);
      },
      error: (error) => {
        console.error('Search failed:', error);
      }
    });
  }

  formatUptime(seconds?: number): string {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}
