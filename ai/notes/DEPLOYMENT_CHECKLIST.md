# ✅ DEPLOYMENT CHECKLIST

Use this checklist to deploy the AI Orchestrator successfully.

---

## 📋 Pre-Deployment Verification

### 1. Dependencies Installation
```bash
cd ai
npm install
```

**Expected packages:**
- ✅ pdf-parse
- ✅ multer
- ✅ openai
- ✅ express
- ✅ axios
- ✅ cors
- ✅ dotenv

**Verify:**
```bash
npm list pdf-parse multer
```

---

### 2. Environment Configuration

Create `.env` file in `ai/` folder:

```env
# REQUIRED - Get from OpenAI
OPENAI_API_KEY=sk-...

# REQUIRED - Your LLM API key
LLM_API_KEY=your_key_here

# REQUIRED - Backend URL
BACKEND_URL=http://localhost:3000

# OPTIONAL - Defaults shown
PORT=3001
NODE_ENV=development
CHUNK_SIZE=500
CHUNK_OVERLAP=100
MIN_SIMILARITY=0.3
SEARCH_TOP_K=5
```

**Verify:**
```bash
# Check if .env exists
ls -la .env

# Test loading (optional)
node -e "require('dotenv').config(); console.log('✓ OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set' : 'Missing')"
```

---

### 3. Backend Service Status

**Check backend is running:**
```bash
curl http://localhost:3000/health
```

Expected: `200 OK` response

**If backend is not running:**
```bash
cd ../backend
npm install
npm start
```

---

### 4. File System Permissions

**Create data directory:**
```bash
cd ai
mkdir -p data
```

**Verify write permissions:**
```bash
touch data/test.txt && rm data/test.txt && echo "✓ Write permission OK"
```

---

## 🚀 Deployment Steps

### Step 1: Start the Service

**Development Mode:**
```bash
cd ai
npm run dev
```

**Production Mode:**
```bash
cd ai
npm start
```

**Expected Output:**
```
🚀 AI Orchestrator running on http://localhost:3001
🔗 Backend URL: http://localhost:3000
```

---

### Step 2: Health Check

```bash
curl http://localhost:3001/health
```

**Expected Response:**
```json
{
  "status": "OK",
  "service": "AI Orchestrator"
}
```

---

### Step 3: Detailed Health Check

```bash
curl -X GET http://localhost:3001/ai/debug/health \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected:**
- ✅ vectorStore: operational
- ✅ embeddings: operational
- ✅ llm: operational
- ✅ system info displayed

---

### Step 4: Test Intent Router

**Test 1: Transactional**
```bash
curl -X POST http://localhost:3001/ai/chat \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "add 100 for coffee"}'
```

**Expected:**
- `intent: "TRANSACTIONAL"`
- Reply with expense confirmation

**Test 2: Clarification**
```bash
curl -X POST http://localhost:3001/ai/chat \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "hello"}'
```

**Expected:**
- `intent: "CLARIFICATION"`
- Help message displayed

---

### Step 5: Test RAG Pipeline

**Upload a sample PDF:**
```bash
curl -X POST http://localhost:3001/ai/upload \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "file=@/path/to/statement.pdf"
```

**Expected Response:**
```json
{
  "success": true,
  "document": {
    "id": "doc_...",
    "filename": "statement.pdf",
    "numPages": 3,
    "numChunks": 12
  }
}
```

**Verify storage:**
```bash
curl -X GET http://localhost:3001/ai/debug/stats \
  -H "Authorization: Bearer YOUR_JWT"
```

**Expected:**
- `totalDocuments: 1`
- `totalChunks: > 0`

---

### Step 6: Test RAG Q&A

```bash
curl -X POST http://localhost:3001/ai/chat \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "what expenses are in my PDF?"}'
```

**Expected:**
- `intent: "RAG_QA"`
- Answer with source citations

---

### Step 7: Test Comparison

**First, ensure you have expenses in the app:**
```bash
curl -X GET http://localhost:3000/api/expenses \
  -H "Authorization: Bearer YOUR_JWT"
```

**Then compare:**
```bash
curl -X POST http://localhost:3001/ai/chat \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "compare my PDF with app expenses"}'
```

**Expected:**
- `intent: "RAG_COMPARE"`
- Comparison summary with matches/differences

---

### Step 8: Test Debug Endpoints

**1. Vector Store Stats:**
```bash
curl http://localhost:3001/ai/debug/stats \
  -H "Authorization: Bearer YOUR_JWT"
```

**2. Similarity Search:**
```bash
curl "http://localhost:3001/ai/debug/search?q=groceries&topK=3" \
  -H "Authorization: Bearer YOUR_JWT"
```

**3. List Chunks:**
```bash
curl "http://localhost:3001/ai/debug/chunks?limit=5" \
  -H "Authorization: Bearer YOUR_JWT"
```

**4. Embedding Test:**
```bash
curl "http://localhost:3001/ai/debug/embedding-test?text=hello%20world" \
  -H "Authorization: Bearer YOUR_JWT"
```

**5. Similarity Test:**
```bash
curl -X POST http://localhost:3001/ai/debug/similarity-test \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"text1": "coffee expense", "text2": "coffee purchase"}'
```

---

## 🔍 Troubleshooting

### Issue: "Cannot find module"
**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: "OPENAI_API_KEY not found"
**Solution:**
```bash
# Verify .env file exists
cat .env | grep OPENAI_API_KEY

# If missing, add it:
echo "OPENAI_API_KEY=your_key_here" >> .env
```

### Issue: "Connection refused" to backend
**Solution:**
```bash
# Check backend is running
curl http://localhost:3000/health

# If not, start backend:
cd ../backend
npm start
```

### Issue: "401 Unauthorized"
**Solution:**
```bash
# Get a fresh JWT token
# Login via frontend or:
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'
```

### Issue: PDF upload fails
**Check:**
1. File size < 10MB
2. Valid PDF format
3. Server has write permissions to `data/` folder

### Issue: Search returns empty
**Solution:**
Upload a PDF first via `/ai/upload`

### Issue: High memory usage
**Solution:**
- Clear vector store: `rm data/vector-store.json`
- Reduce CHUNK_SIZE in .env
- Restart service

---

## 📊 Monitoring

### Key Metrics to Watch

**1. Memory Usage:**
```bash
# From debug/health endpoint
curl http://localhost:3001/ai/debug/health | grep memory
```

**2. Document Count:**
```bash
curl http://localhost:3001/ai/debug/stats | grep totalDocuments
```

**3. Response Time:**
```bash
time curl -X POST http://localhost:3001/ai/chat \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "add 100 for coffee"}'
```

**4. Error Logs:**
```bash
# Check server logs for [ERROR] tags
# In production, pipe to logging service
```

---

## ✅ Post-Deployment Validation

### Functional Tests
- [ ] Transactional intent works (add/list/modify/delete)
- [ ] RAG QA intent works (after PDF upload)
- [ ] RAG Compare intent works (with PDF + app data)
- [ ] Clarification intent works (help/greetings)
- [ ] PDF upload processes successfully
- [ ] Vector store persists to disk
- [ ] Similarity search returns results
- [ ] Debug endpoints accessible

### Performance Tests
- [ ] Chat response < 3 seconds (transactional)
- [ ] PDF upload processes < 10 seconds (per MB)
- [ ] Search completes < 1 second
- [ ] Memory usage stable over time

### Security Tests
- [ ] Endpoints require JWT
- [ ] Invalid tokens rejected
- [ ] File size limits enforced
- [ ] Error messages don't leak secrets

---

## 🎉 SUCCESS CRITERIA

Your deployment is successful when:

✅ All health checks pass  
✅ All 4 intent types work  
✅ PDF upload and RAG pipeline functional  
✅ Comparison engine produces results  
✅ Debug endpoints accessible  
✅ No errors in server logs  
✅ Vector store persists across restarts  
✅ Memory usage within acceptable limits  

---

## 📞 Support

If issues persist after following this checklist:

1. Check server logs for detailed errors
2. Review [ARCHITECTURE.md](ARCHITECTURE.md) for system design
3. Consult [QUICKSTART.md](QUICKSTART.md) for examples
4. Test individual components via debug endpoints

---

**Status:** All systems operational and ready for production! 🚀
