# RAG Flow Testing Guide

## Upload and Query Flow

### Step 1: Upload a PDF Document
1. Open the AI Chat (click the floating bot icon)
2. Click the "Upload PDF Document" button or the attach icon (📎) in the input area
3. Select a PDF file (max 10MB)
4. Wait for processing confirmation showing chunk count

### Step 2: Ask Questions About the Document
Once uploaded, you can ask questions like:

**For expense statements/receipts:**
- "What was the total amount spent in this document?"
- "How much did I spend on dining?"
- "List all the transactions from January"
- "What's the largest expense in this document?"

**For comparisons:**
- "Compare the expenses in this PDF with my tracked expenses for the same period"
- "Are there any expenses in the PDF that I haven't recorded?"
- "What's the difference between my receipts and tracked expenses?"

### Step 3: RAG Intents
The system automatically routes to appropriate handlers:

- **RAG_QA**: Simple questions about document content
  - "What does the document say about X?"
  - "How much was spent on Y?"
  
- **RAG_COMPARE**: Comparison between document and database
  - "Compare this with my expenses"
  - "What's missing from my tracked expenses?"

### Example Test Flow

```bash
# 1. Login to get token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@example.com", "password": "password123"}'

# 2. Upload test PDF (from UI)
# Click upload button, select PDF file

# 3. Ask question (after upload completes)
curl -X POST http://localhost:3001/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"message": "What are the total expenses in the uploaded document?"}'

# 4. Compare with tracked expenses
curl -X POST http://localhost:3001/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"message": "Compare these expenses with my tracked expenses for this month"}'
```

### Features Added

✅ **File Upload UI**
- Attach button in chat input
- Upload button in welcome screen
- File type validation (.pdf only)
- Size limit (10MB max)
- Upload progress feedback

✅ **Document Management**
- Chip-based display of uploaded documents
- Remove documents from display (visual only)
- Upload status messages in chat

✅ **RAG Integration**
- Automatic chunking and embedding
- User-scoped document isolation
- Context-aware Q&A
- Expense comparison

### Testing with Sample PDF

Create a simple test PDF with expense data or use any receipt/statement PDF. The system will:
1. Extract text from PDF
2. Split into 1500-character chunks
3. Generate embeddings (Snowflake Arctic)
4. Store in user-scoped vector store
5. Enable similarity search for Q&A

### Backend Endpoints

- `POST /ai/upload` - Upload PDF for processing
- `POST /ai/chat` - Chat with RAG context
- `GET /ai/debug/vector-db` - View stored chunks (debug)
