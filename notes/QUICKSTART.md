# 🚀 QUICK START GUIDE

## Prerequisites
- Node.js 18+ installed
- OpenAI API key (for embeddings)
- Backend service running on http://localhost:3000
- Valid JWT token from backend

---

## 📦 Installation Steps

### 1. Navigate to AI folder
```bash
cd ai
```

### 2. Install dependencies
```bash
npm install
```

**New Dependencies Added:**
- `pdf-parse` - PDF text extraction
- `multer` - File upload handling

### 3. Configure environment
Create a `.env` file in the `ai/` folder:

```env
# Required
OPENAI_API_KEY=your_openai_api_key_here
LLM_API_KEY=your_llm_api_key_here
BACKEND_URL=http://localhost:3000

# Optional (defaults shown)
PORT=3001
NODE_ENV=development
CHUNK_SIZE=500
CHUNK_OVERLAP=100
MIN_SIMILARITY=0.3
SEARCH_TOP_K=5
```

### 4. Start the service

**Development mode (with hot-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The service will start on **http://localhost:3001**

---

## ✅ Health Check

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "OK",
  "service": "AI Orchestrator"
}
```

---

## 🧪 Test the System

### 1. Test Transactional (Expense Operations)

```bash
curl -X POST http://localhost:3001/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "add 500 rupees for lunch today"
  }'
```

### 2. Test Clarification (Help)

```bash
curl -X POST http://localhost:3001/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "what can you do?"
  }'
```

### 3. Test PDF Upload

```bash
curl -X POST http://localhost:3001/ai/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/your/statement.pdf"
```

### 4. Test RAG QA (After uploading PDF)

```bash
curl -X POST http://localhost:3001/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "what expenses are in my uploaded statement?"
  }'
```

### 5. Test Comparison

```bash
curl -X POST http://localhost:3001/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "compare my bank statement with my tracked expenses"
  }'
```

---

## 🔍 Debug Endpoints

### Get System Stats
```bash
curl -X GET http://localhost:3001/ai/debug/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test Similarity Search
```bash
curl -X GET "http://localhost:3001/ai/debug/search?q=groceries&topK=3" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### List Uploaded Documents
```bash
curl -X GET http://localhost:3001/ai/debug/documents \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Health Check (Detailed)
```bash
curl -X GET http://localhost:3001/ai/debug/health \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 📁 Data Storage

The system creates a `data/` folder to persist:
- **vector-store.json** - All uploaded documents, chunks, and embeddings

This file is automatically created and updated. To reset:
```bash
rm -rf data/vector-store.json
```

---

## 🐛 Troubleshooting

### "Module not found" errors
```bash
npm install
```

### "OPENAI_API_KEY not found"
- Create `.env` file in `ai/` folder
- Add `OPENAI_API_KEY=your_key_here`

### "Connection refused" to backend
- Ensure backend is running on http://localhost:3000
- Update `BACKEND_URL` in `.env` if different

### "Unauthorized" errors
- Get a valid JWT token from the backend
- Login via frontend or backend API first

### PDF upload fails
- Check file size (max 10MB)
- Ensure file is a valid PDF
- Check server logs for details

---

## 📊 Architecture Overview

```
POST /ai/chat → Intent Router → Handler (TRANSACTIONAL | RAG_QA | RAG_COMPARE | CLARIFICATION)
POST /ai/upload → PDF Extract → Chunk → Embed → Store
GET /ai/debug/* → Observability endpoints
```

For detailed architecture, see [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 🎯 What's Been Implemented

✅ **Intent Router** - Classifies requests into 4 categories  
✅ **Handler Layer** - Separate handlers for each intent  
✅ **RAG Pipeline** - Full PDF → embed → search → answer  
✅ **Comparison Engine** - Code-based expense diff  
✅ **MCP Tools** - Backend API wrappers  
✅ **Vector Store** - In-memory with disk persistence  
✅ **Similarity Search** - Cosine similarity with hybrid mode  
✅ **Debug Endpoints** - Full observability suite  

---

## 🚀 Ready for Demo!

The system is now **production-grade** and **demoable**:
- Natural language expense operations
- Document-based intelligence
- Smart expense comparison
- Full observability
- Scalable architecture

Run `npm start` and test away! 🎉
