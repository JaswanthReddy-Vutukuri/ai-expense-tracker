# QUICKSTART GUIDE - AI-LANGX

Get the LangChain-based AI orchestrator running in 5 minutes.

---

## Prerequisites

✅ Node.js 18+ installed  
✅ Backend server running on port 3000  
✅ OpenAI API key  
✅ LangSmith API key (optional, for tracing)

---

## Step 1: Install Dependencies

```bash
cd ai-langx
npm install
```

This installs:
- `@langchain/core` - Core LangChain functionality
- `@langchain/openai` - OpenAI integration
- `langsmith` - Observability platform
- `express` - Web server
- `zod` - Schema validation
- Other utilities

**Installation time**: ~2 minutes

---

## Step 2: Configure Environment

```bash
# Copy template
cp env.template .env

# Edit .env file
nano .env  # or use your preferred editor
```

**Required variables**:
```env
OPENAI_API_KEY=sk-your-openai-api-key-here
BACKEND_BASE_URL=http://localhost:3000
```

**Optional (for LangSmith tracing)**:
```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-langsmith-api-key-here
LANGCHAIN_PROJECT=expense-tracker-ai-langx
```

Get LangSmith API key: https://smith.langchain.com/

---

## Step 3: Start Server

```bash
npm start
```

You should see:
```
═══════════════════════════════════════════════════════════
  🚀 AI-LANGX ORCHESTRATOR (LangChain Implementation)  
═══════════════════════════════════════════════════════════
  📍 Server:    http://localhost:3002
  🔗 Backend:   http://localhost:3000
  🧠 LLM:       gpt-4o-mini
  📊 LangSmith: ✅ ENABLED
  🏠 Project:   expense-tracker-ai-langx
═══════════════════════════════════════════════════════════
```

---

## Step 4: Get JWT Token

You need a JWT token to authenticate. Get it from the backend:

```bash
# Login to backend
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

**Response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {...}
}
```

**Save the token**:
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Step 5: Test Chat Endpoint

```bash
# Add an expense
curl -X POST http://localhost:3002/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Add 500 for lunch today"
  }'
```

**Expected response**:
```json
{
  "reply": "✅ Successfully added ₹500 for Food on 2026-02-08"
}
```

---

## Step 6: View LangSmith Trace (Optional)

If you enabled LangSmith:

1. Go to https://smith.langchain.com/
2. Navigate to your project: `expense-tracker-ai-langx`
3. Find the latest trace
4. Click to view detailed execution:
   - LLM calls with prompts and responses
   - Tool calls with arguments and results
   - Token usage and cost
   - Execution time per step

---

## Common Commands

```bash
# Development mode (auto-reload)
npm run dev

# Production mode
npm start

# Run tests (when implemented)
npm test

# Health check
curl http://localhost:3002/health
```

---

## Compare with Custom Implementation

Both implementations are running simultaneously:

```bash
# Custom implementation (port 3001)
curl -X POST http://localhost:3001/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Show my expenses"}'

# Framework implementation (port 3002)
curl -X POST http://localhost:3002/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Show my expenses"}'
```

**They should return similar results!**

---

## Example Interactions

### Add Expense
```bash
curl -X POST http://localhost:3002/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Add 1500 for groceries yesterday"}'
```

### List Expenses
```bash
curl -X POST http://localhost:3002/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Show all my expenses"}'
```

### Update Expense
```bash
# First, list to get ID
curl -X POST http://localhost:3002/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "List my expenses"}'

# Then update
curl -X POST http://localhost:3002/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Update expense 123 amount to 600"}'
```

---

## Troubleshooting

### Server won't start

**Error**: `Cannot find module '@langchain/core'`  
**Solution**: Run `npm install`

**Error**: `Port 3002 already in use`  
**Solution**: Change `PORT=3003` in `.env`

### Authentication errors

**Error**: `Authorization header missing`  
**Solution**: Include `-H "Authorization: Bearer $TOKEN"` in curl

**Error**: `Invalid token`  
**Solution**: Get new token from backend (tokens expire)

### LangSmith not showing traces

**Error**: No traces in LangSmith  
**Solution**: Check these:
1. `LANGCHAIN_TRACING_V2=true` in `.env`
2. `LANGCHAIN_API_KEY` is set correctly
3. Wait 10-30 seconds for traces to appear
4. Check correct project name

### Backend connection failed

**Error**: `Cannot connect to backend`  
**Solution**: Ensure backend is running on `http://localhost:3000`

---

## Next Steps

1. ✅ **Read Documentation**: See [README.md](../README.md)
2. 📊 **Compare Implementations**: See [docs/COMPARISON.md](../docs/COMPARISON.md)
3. 🏗️ **Understand Architecture**: See [ARCHITECTURE_ANALYSIS.md](../ARCHITECTURE_ANALYSIS.md)
4. 🔍 **Explore Code**: Start with `src/tools/createExpense.tool.js`
5. 🚀 **Build Features**: Implement RAG pipeline (Phase 2)

---

## Quick Reference

| **Endpoint** | **URL** |
|--------------|---------|
| Framework Chat | http://localhost:3002/ai/chat |
| Custom Chat | http://localhost:3001/ai/chat |
| Health Check | http://localhost:3002/health |
| Endpoint Info | http://localhost:3002/ai/chat/info |
| Backend API | http://localhost:3000/api |
| LangSmith | https://smith.langchain.com/ |

---

**🎉 You're all set! Start building with LangChain.**

For help, see [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) or [COMPARISON.md](./COMPARISON.md).
