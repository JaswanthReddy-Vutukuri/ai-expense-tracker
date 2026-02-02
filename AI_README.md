# Expense Tracker AI Orchestrator

This service is a Node.js microservice that implements an **AI Orchestrator** using the **Model Context Protocol (MCP)** pattern with **RAG (Retrieval-Augmented Generation)** capabilities. It allows users to interact with their expense data using natural language and provides intelligent document analysis.

## 🌟 Features

### 1. Natural Language Expense Operations (TRANSACTIONAL)
- Add, modify, delete, and list expenses using conversational language
- Intelligent category mapping
- Date parsing (today, yesterday, last Friday, etc.)
- Multi-expense processing in single request

### 2. Document Intelligence (RAG_QA)
- Upload PDF expense statements (bank statements, credit card bills)
- Ask questions about uploaded documents
- Semantic search with source citations
- Extract and analyze expense data from PDFs

### 3. Smart Comparison (RAG_COMPARE)
- Compare PDF expenses with app-tracked expenses
- Code-based diff computation (not LLM-generated)
- Identify discrepancies, missing entries
- Match confidence scoring

### 4. Help & Guidance (CLARIFICATION)
- Context-aware help system
- System capability explanations
- Friendly onboarding

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    POST /ai/chat                            │
│                  (Single Entry Point)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │ Intent Router  │ ← Classifies user intent
            │  (Agent-lite)  │
            └────────┬───────┘
                     │
        ┌────────────┼────────────┬─────────────┐
        │            │            │             │
        ▼            ▼            ▼             ▼
  ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐
  │TRANSACT  │ │ RAG_QA  │ │RAG_COMPARE│ │CLARIFICATION │
  │          │ │         │ │          │ │              │
  │ LLM +    │ │Vector   │ │Code Diff │ │Static Help   │
  │ MCP      │ │Search + │ │+ LLM     │ │Responses     │
  │ Tools    │ │ LLM     │ │Explain   │ │              │
  └────┬─────┘ └────┬────┘ └────┬─────┘ └──────────────┘
       │            │            │
       ▼            ▼            ▼
   Backend     Vector Store  Comparison
     API       + Embeddings    Engine
```

### Core Components

#### Router Layer
- **intentRouter.js** - Classifies requests into execution paths
- Hybrid approach: Rule-based + LLM classification

#### Handler Layer
- **transactionalHandler.js** - Expense CRUD operations
- **ragQaHandler.js** - Document Q&A with context retrieval
- **ragCompareHandler.js** - Expense reconciliation
- **clarificationHandler.js** - Help and guidance

#### RAG Pipeline
- **pdfExtractor.js** - PDF text extraction (pdf-parse)
- **chunker.js** - Smart text splitting with overlap
- **embeddings.js** - OpenAI text-embedding-ada-002
- **vectorStore.js** - In-memory vector DB with persistence
- **search.js** - Cosine similarity search engine

#### MCP Tools (Backend Wrappers)
- **create_expense** - Add expenses
- **list_expenses** - Retrieve with filters
- **modify_expense** - Update existing
- **delete_expense** - Remove single
- **clear_expenses** - Bulk operations

## 🚀 Quick Start

See [QUICKSTART.md](QUICKSTART.md) for detailed setup instructions.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 3. Start the service
npm run dev  # Development with hot-reload
npm start    # Production
```

## 📡 API Endpoints

### Chat (Main Interface)
```http
POST /ai/chat
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "message": "add 500 for lunch today"
}
```

### PDF Upload
```http
POST /ai/upload
Authorization: Bearer <JWT>
Content-Type: multipart/form-data

file: statement.pdf
```

### Debug & Observability
```http
GET /ai/debug/stats          # System statistics
GET /ai/debug/search?q=...   # Test similarity search
GET /ai/debug/chunks         # View document chunks
GET /ai/debug/documents      # List uploaded PDFs
GET /ai/debug/health         # Health check
```

## 🔧 Configuration

### Required Environment Variables
```env
OPENAI_API_KEY=your_openai_key     # For embeddings
LLM_API_KEY=your_llm_key           # For chat completions
BACKEND_URL=http://localhost:3000  # Backend API URL
```

### Optional Configuration
```env
PORT=3001                    # Service port
CHUNK_SIZE=500              # Characters per chunk
CHUNK_OVERLAP=100           # Overlap between chunks
MIN_SIMILARITY=0.3          # Search threshold
SEARCH_TOP_K=5              # Results to return
```

## 📚 Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Detailed system architecture
- **[QUICKSTART.md](QUICKSTART.md)** - Setup and testing guide
- **[OPENAPI.md](OPENAPI.md)** - API specifications

## 🎯 Example Interactions

### Transactional
```
User: "add 1500 for groceries yesterday"
AI: "Added ₹1500 for Food on 2026-01-31"

User: "show all my transport expenses this month"
AI: [Lists transport expenses with totals]
```

### RAG QA
```
User: "what did I spend on restaurants in my credit card statement?"
AI: "According to your uploaded statement, you spent ₹3,450 on 
     restaurants: ₹1,200 at Cafe Coffee Day [Source 1], ₹1,500 at 
     Domino's Pizza [Source 3], and ₹750 at Subway [Source 5]."
```

### RAG Compare
```
User: "compare my bank statement with my tracked expenses"
AI: "I found 18 matched expenses, but there are 3 discrepancies:
     - ₹850 ATM withdrawal on Jan 28 is in your statement but not tracked
     - ₹200 coffee expense on Jan 29 is tracked but not in statement
     Overall match rate: 85.7%. Consider adding the missing expenses."
```

## 🔐 Security

- JWT-based authentication (extracted and forwarded to backend)
- No direct database access (all via backend APIs)
- File size limits (10MB for PDFs)
- Input validation and sanitization
- Centralized error handling

## 📊 Observability

### Logging
- Request/response tracing
- Tool execution logs
- Error stack traces (development only)

### Metrics (via /debug endpoints)
- Document count and chunk statistics
- Vector store size and dimension
- Search performance metrics
- System resource usage

## 🧪 Testing

```bash
# Get JWT token first (from backend)
export JWT="your_jwt_token"

# Test transactional
curl -X POST http://localhost:3001/ai/chat \
  -H "Authorization: Bearer $JWT" \
  -d '{"message": "add 100 for coffee"}'

# Upload PDF
curl -X POST http://localhost:3001/ai/upload \
  -H "Authorization: Bearer $JWT" \
  -F "file=@statement.pdf"

# Ask about PDF
curl -X POST http://localhost:3001/ai/chat \
  -H "Authorization: Bearer $JWT" \
  -d '{"message": "what groceries are in my statement?"}'

# Compare
curl -X POST http://localhost:3001/ai/chat \
  -H "Authorization: Bearer $JWT" \
  -d '{"message": "compare my statement with app"}'
```

## 🛠️ Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **LLM**: OpenAI GPT-4o (via custom endpoint)
- **Embeddings**: OpenAI text-embedding-ada-002
- **PDF Processing**: pdf-parse
- **File Upload**: multer
- **HTTP Client**: axios

## 📈 Scalability

### Current Capabilities
- In-memory vector store with disk persistence
- Stateless design (horizontally scalable)
- Efficient batch embedding generation
- Configurable chunk size and search parameters

### Production Considerations
- Consider external vector DB (Pinecone, Weaviate, Qdrant)
- Add Redis for caching
- Implement rate limiting
- Add request queuing for large PDFs
- Monitor memory usage with large document sets

## 🐛 Troubleshooting

**"Module not found" errors**
→ Run `npm install`

**"OPENAI_API_KEY not found"**
→ Create `.env` file with required keys

**"Connection refused" to backend**
→ Ensure backend is running on configured URL

**PDF upload fails**
→ Check file size (<10MB) and valid PDF format

**Search returns no results**
→ Upload documents first via `/ai/upload`

## 📝 Key Principles

1. ✅ Single entry point (POST /ai/chat)
2. ✅ Deterministic intent routing (not autonomous agent)
3. ✅ MCP pattern (AI never accesses DB directly)
4. ✅ Separation of concerns (Router → Handler → MCP → Backend)
5. ✅ Computation in code (comparison logic not in LLM)
6. ✅ Full RAG pipeline (extract → chunk → embed → search → augment)
7. ✅ Production-grade error handling and logging

## 🎉 Status

**✅ PRODUCTION READY**

All core features implemented:
- Intent routing
- Handler architecture
- Full RAG pipeline
- Comparison engine
- Debug endpoints
- Documentation complete

Ready for demos and production deployment!
