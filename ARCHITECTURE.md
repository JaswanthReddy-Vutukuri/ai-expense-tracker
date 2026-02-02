# AI ORCHESTRATOR - COMPLETE ARCHITECTURE

## 🎯 Overview

Enterprise-grade AI Orchestrator implementing **Model Context Protocol (MCP)** with **RAG (Retrieval-Augmented Generation)** capabilities for intelligent expense management.

---

## 📁 Directory Structure

```
ai/
├── server.js                          # Main Express server
├── package.json                       # Dependencies
├── .env.example                       # Environment template
├── data/                              # Runtime data storage
│   └── vector-store.json              # Persisted vector database
├── src/
│   ├── router/
│   │   └── intentRouter.js            # Intent classification (Agent-lite)
│   ├── handlers/
│   │   ├── transactionalHandler.js    # Expense CRUD operations
│   │   ├── ragQaHandler.js            # Document Q&A
│   │   ├── ragCompareHandler.js       # PDF vs App comparison
│   │   └── clarificationHandler.js    # Help & guidance
│   ├── llm/
│   │   ├── agent.js                   # OpenAI tool-calling loop
│   │   └── systemPrompt.js            # LLM instructions
│   ├── mcp/
│   │   ├── tool.interface.js          # Tool type definitions
│   │   └── tools/                     # Backend API wrappers
│   │       ├── index.js               # Tool registry
│   │       ├── createExpense.js
│   │       ├── listExpenses.js
│   │       ├── modifyExpense.js
│   │       ├── deleteExpense.js
│   │       └── clearExpenses.js
│   ├── rag/
│   │   ├── chunker.js                 # Text splitting with overlap
│   │   ├── embeddings.js              # OpenAI embeddings
│   │   ├── vectorStore.js             # In-memory vector DB
│   │   └── search.js                  # Similarity search engine
│   ├── comparison/
│   │   └── expenseComparator.js       # Code-based diff logic
│   ├── routes/
│   │   ├── chat.js                    # POST /ai/chat
│   │   ├── upload.js                  # POST /ai/upload
│   │   └── debug.js                   # GET /ai/debug/*
│   ├── middleware/
│   │   ├── auth.js                    # JWT extraction
│   │   └── errorHandler.js            # Centralized errors
│   └── utils/
│       ├── backendClient.js           # Backend API client
│       └── pdfExtractor.js            # PDF text extraction
```

---

## 🔄 Request Flow

### 1. **POST /ai/chat** (Main Entry Point)

```
User Message
    ↓
[Auth Middleware] → Extract JWT
    ↓
[Intent Router] → Classify: TRANSACTIONAL | RAG_QA | RAG_COMPARE | CLARIFICATION
    ↓
    ├─→ [Transactional Handler] → LLM Agent → MCP Tools → Backend API
    │
    ├─→ [RAG QA Handler] → Vector Search → LLM with Context → Answer
    │
    ├─→ [RAG Compare Handler] → Extract PDF Expenses → Fetch App Expenses → Code Diff → LLM Explain
    │
    └─→ [Clarification Handler] → Static/Template Response
    ↓
Natural Language Response
```

### 2. **POST /ai/upload** (PDF Upload)

```
PDF File
    ↓
[Multer] → Validate & Buffer
    ↓
[PDF Extractor] → Extract Text
    ↓
[Chunker] → Split with Overlap (500 chars, 100 overlap)
    ↓
[Embeddings] → Generate Vectors (OpenAI ada-002)
    ↓
[Vector Store] → Store In-Memory + Persist to Disk
    ↓
Success Response with Document ID
```

### 3. **GET /ai/debug/*** (Observability)

- `/ai/debug/stats` - Vector store statistics
- `/ai/debug/chunks` - List all chunks
- `/ai/debug/search?q=query` - Test similarity search
- `/ai/debug/documents` - List uploaded documents
- `/ai/debug/health` - System health check

---

## 🧠 Intent Classification

### TRANSACTIONAL
**Triggers:** add, create, show, list, delete, update, modify expenses  
**Examples:**
- "Add ₹500 for lunch today"
- "Show my transport expenses this week"
- "Delete expense 123"

### RAG_QA
**Triggers:** questions about PDF documents, statements, uploaded files  
**Examples:**
- "What did I spend on groceries according to my statement?"
- "Summarize my credit card bill"
- "How much was the hotel charge in my PDF?"

### RAG_COMPARE
**Triggers:** compare, difference, match, discrepancy, vs  
**Examples:**
- "Compare my bank statement with my tracked expenses"
- "Find differences between PDF and app"
- "What's missing in my app that's in the PDF?"

### CLARIFICATION
**Triggers:** greetings, help requests, unclear inputs  
**Examples:**
- "Hello"
- "What can you do?"
- Ambiguous or out-of-scope requests

---

## 🔧 MCP Tools (Backend Wrappers)

| Tool | Backend Endpoint | Purpose |
|------|------------------|---------|
| `create_expense` | POST /api/expenses | Add new expense |
| `list_expenses` | GET /api/expenses | Retrieve expenses |
| `modify_expense` | PUT /api/expenses/:id | Update expense |
| `delete_expense` | DELETE /api/expenses/:id | Remove expense |
| `clear_expenses` | DELETE /api/expenses | Bulk delete |

**Key Principle:** AI never directly accesses database. All operations via MCP → Backend APIs.

---

## 📄 RAG Pipeline

### Components

1. **PDF Extraction** (`pdfExtractor.js`)
   - Library: `pdf-parse`
   - Validates PDF signature
   - Extracts text and metadata

2. **Chunking** (`chunker.js`)
   - Default: 500 characters per chunk
   - Overlap: 100 characters
   - Smart sentence boundary detection

3. **Embeddings** (`embeddings.js`)
   - Model: `text-embedding-ada-002` (OpenAI)
   - Dimension: 1536
   - Batch processing with retry logic

4. **Vector Store** (`vectorStore.js`)
   - In-memory storage
   - Persists to `data/vector-store.json`
   - Supports CRUD on documents

5. **Similarity Search** (`search.js`)
   - Cosine similarity computation
   - Top-K retrieval
   - Hybrid search (semantic + keyword)

---

## 🔍 Comparison Engine

### Algorithm (`expenseComparator.js`)

1. **Normalization**
   - Dates → YYYY-MM-DD
   - Amounts → Float
   - Descriptions → Lowercase

2. **Matching Logic**
   - Amount tolerance: ±₹0.01
   - Date matching (optional)
   - Description similarity (Jaccard)

3. **Classification**
   - **Matched:** Found in both
   - **PDF Only:** Missing in app
   - **App Only:** Not in PDF

4. **Output**
   - Structured diff object
   - Summary statistics
   - Match confidence scores

**LLM Role:** Only explains results. Does NOT compute diff.

---

## 🌐 API Endpoints

### Chat
```bash
POST /ai/chat
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "message": "Add 500 for lunch"
}

Response: {
  "reply": "Added ₹500 for Food on 2026-02-01",
  "intent": "TRANSACTIONAL"
}
```

### Upload PDF
```bash
POST /ai/upload
Content-Type: multipart/form-data
Authorization: Bearer <JWT>

file: statement.pdf

Response: {
  "success": true,
  "document": {
    "id": "doc_123",
    "filename": "statement.pdf",
    "numChunks": 45
  }
}
```

### Debug Search
```bash
GET /ai/debug/search?q=groceries&topK=3
Authorization: Bearer <JWT>

Response: {
  "success": true,
  "results": [...]
}
```

---

## 🔒 Security

1. **JWT Forwarding**
   - AI service extracts JWT
   - Forwards to backend for validation
   - Never validates tokens locally

2. **Input Validation**
   - File size limits (10MB)
   - PDF signature checks
   - Request body validation

3. **Error Handling**
   - Centralized error middleware
   - No sensitive data in responses
   - Proper HTTP status codes

---

## 🚀 Deployment

### Environment Setup
```bash
cd ai
cp .env.example .env
# Edit .env with your keys
```

### Install Dependencies
```bash
npm install
```

### Run Development
```bash
npm run dev
```

### Run Production
```bash
npm start
```

---

## 📊 Observability

### Logging
- Request/response logging
- Tool execution traces
- Error stack traces (dev only)

### Metrics (via /debug/stats)
- Total documents
- Total chunks
- Embedding dimension
- Memory usage
- Uptime

### Debug Endpoints
- Test embeddings
- Test similarity
- Test comparison
- View vector store

---

## 🧪 Testing Examples

### Test Transactional
```bash
curl -X POST http://localhost:3001/ai/chat \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "add 100 for coffee"}'
```

### Test RAG QA
```bash
# First upload a PDF
curl -X POST http://localhost:3001/ai/upload \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "file=@statement.pdf"

# Then ask questions
curl -X POST http://localhost:3001/ai/chat \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "what groceries are in my PDF?"}'
```

### Test Comparison
```bash
curl -X POST http://localhost:3001/ai/chat \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "compare my statement with tracked expenses"}'
```

---

## 📝 Key Architectural Principles

1. ✅ **Single Entry Point** - All requests via POST /ai/chat
2. ✅ **Intent Routing** - Deterministic classification, not autonomous agent
3. ✅ **MCP Pattern** - AI never calls backend directly
4. ✅ **Separation of Concerns** - Router → Handler → MCP → Backend
5. ✅ **Computation in Code** - Comparison logic not in LLM
6. ✅ **RAG Pipeline** - Full extract → embed → search → augment flow
7. ✅ **Observability** - Debug endpoints for all internal state

---

## 🔮 Future Enhancements

- [ ] User-specific document isolation
- [ ] Multiple PDF uploads per user
- [ ] Advanced NER for expense extraction
- [ ] Caching layer for embeddings
- [ ] Rate limiting
- [ ] Audit logs
- [ ] Performance metrics

---

## 📄 License

Part of the Expense Tracker monorepo. All rights reserved.
