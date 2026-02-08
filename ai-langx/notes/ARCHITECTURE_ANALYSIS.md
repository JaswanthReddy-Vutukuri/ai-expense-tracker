# AI Orchestrator: Custom vs Framework Architecture Analysis

**Project**: AI Expense Tracker  
**Analysis Date**: February 8, 2026  
**Purpose**: Map existing custom implementation to LangChain/LangGraph/LangSmith concepts

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Existing Architecture Overview](#existing-architecture-overview)
3. [Execution Flows](#execution-flows)
4. [Custom → Framework Mapping](#custom--framework-mapping)
5. [Component Deep Dive](#component-deep-dive)
6. [Safety & Production Patterns](#safety--production-patterns)
7. [Migration Strategy](#migration-strategy)

---

## Executive Summary

The existing **ai/** orchestrator implements a **production-grade, custom AI system** with:

- ✅ **Intent-based routing** (lightweight agent pattern)
- ✅ **MCP tool execution** (validated, deterministic)
- ✅ **Full RAG pipeline** (ingest, chunk, embed, retrieve, generate)
- ✅ **Bi-directional reconciliation** (PDF ↔ App sync)
- ✅ **Production safety** (timeouts, retries, validation, logging)
- ✅ **User isolation** (multi-tenant ready)
- ✅ **Cost controls** (rate limiting, token limits)

**Key Philosophy**: 
- LLM for intent understanding and generation
- Deterministic code for business logic
- No LLM in critical financial decisions
- Additive-only reconciliation (never auto-delete)

---

## Existing Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Angular)                       │
│                    DO NOT MODIFY - Out of Scope                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI ORCHESTRATOR (ai/)                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  server.js (Express + Security + Rate Limiting)             │ │
│ └─────────────────────────┬───────────────────────────────────┘ │
│                           │                                       │
│                           ▼                                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  /ai/chat Route (authMiddleware + traceId + validation)    │ │
│ └─────────────────────────┬───────────────────────────────────┘ │
│                           │                                       │
│                           ▼                                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  Intent Router (LLM-based classification)                   │ │
│ │  - TRANSACTIONAL: CRUD operations                           │ │
│ │  - RAG_QA: Question answering from PDFs                     │ │
│ │  - RAG_COMPARE: PDF vs App diff                             │ │
│ │  - SYNC_RECONCILE: Bi-directional sync workflow             │ │
│ │  - CLARIFICATION: Ambiguous/out-of-scope                    │ │
│ └─────────────────────────┬───────────────────────────────────┘ │
│                           │                                       │
│              ┌────────────┼────────────┬─────────────┐           │
│              ▼            ▼            ▼             ▼           │
│  ┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │Transactional │ │ RAG QA   │ │RAG Compare│ │Sync/Reconcile│   │
│  │   Handler    │ │ Handler  │ │  Handler  │ │   Handler    │   │
│  └──────┬───────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘   │
│         │              │             │               │           │
│         ▼              ▼             ▼               ▼           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              LLM Agent (Tool Calling)                    │   │
│  │  - OpenAI function calling                               │   │
│  │  - Max iterations: 5                                     │   │
│  │  - Timeout: 60s                                          │   │
│  │  - System prompt + tool definitions                      │   │
│  └───────────────────────┬──────────────────────────────────┘   │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              MCP Tool Registry                           │   │
│  │  - create_expense                                        │   │
│  │  - list_expenses                                         │   │
│  │  - modify_expense                                        │   │
│  │  - delete_expense                                        │   │
│  │  - clear_expenses                                        │   │
│  │                                                          │   │
│  │  Each tool:                                              │   │
│  │  ✓ Validates arguments                                  │   │
│  │  ✓ Wraps backend API call                               │   │
│  │  ✓ Handles errors                                       │   │
│  │  ✓ Logs execution                                       │   │
│  └───────────────────────┬──────────────────────────────────┘   │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Node.js + SQLite)                  │
│                    DO NOT MODIFY - Out of Scope                  │
│  - /api/expenses (CRUD endpoints)                                │
│  - JWT auth                                                      │
│  - User isolation                                                │
└─────────────────────────────────────────────────────────────────┘
```

### RAG Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        RAG PIPELINE                              │
│                                                                  │
│  INGESTION (Upload Flow):                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. PDF Upload (/ai/upload)                                 │ │
│  │    ↓                                                        │ │
│  │ 2. Extract Text (pdf-parse)                                │ │
│  │    ↓                                                        │ │
│  │ 3. Chunk Text (semantic + size-based chunking)             │ │
│  │    - Max: 500 tokens                                       │ │
│  │    - Overlap: 50 tokens                                    │ │
│  │    ↓                                                        │ │
│  │ 4. Generate Embeddings (text-embedding-ada-002)            │ │
│  │    - Batch processing                                      │ │
│  │    - Timeout: 15s per batch                                │ │
│  │    ↓                                                        │ │
│  │ 5. Store in Vector DB (in-memory + disk persistence)       │ │
│  │    - User isolation built-in                               │ │
│  │    - File: data/vector-store.json                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  RETRIEVAL (Query Flow):                                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. User Query                                              │ │
│  │    ↓                                                        │ │
│  │ 2. Generate Query Embedding                                │ │
│  │    ↓                                                        │ │
│  │ 3. Cosine Similarity Search                                │ │
│  │    - Top K: 5 chunks (configurable)                        │ │
│  │    - User-filtered                                         │ │
│  │    ↓                                                        │ │
│  │ 4. Context Assembly                                        │ │
│  │    ↓                                                        │ │
│  │ 5. LLM Generation (RAG prompt)                             │ │
│  │    - Answer with citations                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Reconciliation Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│            SYNC/RECONCILE WORKFLOW (Multi-Stage)                 │
│                                                                  │
│  Stage 1: COMPARE                                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Extract PDF expenses from vector store                   │ │
│  │ • Fetch App expenses via backend API                       │ │
│  │ • Normalize dates, amounts, categories                     │ │
│  │ • Compute diff:                                            │ │
│  │   - matched: Expenses in both (same amount+date)          │ │
│  │   - pdf_only: In PDF but not in app                       │ │
│  │   - app_only: In app but not in PDF                       │ │
│  │ • Return structured diff (NOT LLM explanation)             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          ↓                                       │
│  Stage 2: PLAN (Deterministic - NO LLM)                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Validate each expense (amount, date, description)        │ │
│  │ • Apply business rules:                                    │ │
│  │   - Min amount: ₹1                                         │ │
│  │   - Max auto-sync: ₹10,000                                 │ │
│  │   - No duplicates                                          │ │
│  │ • Generate TWO-SIDED plan:                                 │ │
│  │   - to_app: pdf_only → add to app via MCP                 │ │
│  │   - to_pdf: app_only → add to regenerated PDF             │ │
│  │ • ADDITIVE-ONLY (never auto-delete)                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          ↓                                       │
│  Stage 3: VALIDATE                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Check prerequisites:                                     │ │
│  │   - User has uploaded PDFs                                 │ │
│  │   - Plan is non-empty                                      │ │
│  │   - Auth token valid                                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          ↓                                       │
│  Stage 4: EXECUTE                                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Execute plan via MCP tools:                              │ │
│  │   - Call create_expense for each to_app item              │ │
│  │   - Log success/failure for each                          │ │
│  │ • Collect execution results                                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          ↓                                       │
│  Stage 5: REPORT                                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Generate downloadable expense report (HTML/CSV)          │ │
│  │ • Include:                                                 │ │
│  │   - Synced expenses                                        │ │
│  │   - Summary statistics                                     │ │
│  │   - Timestamp & user ID                                    │ │
│  │ • Save to data/reports/                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          ↓                                       │
│  Stage 6: RESPOND                                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Return natural language summary:                         │ │
│  │   - "Synced X expenses to app"                             │ │
│  │   - "Report available at: [URL]"                           │ │
│  │   - Error handling if partial failure                      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Execution Flows

### Flow 1: Transactional Expense Operation

```
User: "Add ₹500 for lunch today"
  ↓
[/ai/chat] → Auth + Validation + TraceID
  ↓
[Intent Router] → Classify → TRANSACTIONAL
  ↓
[Transactional Handler] → processChatMessage()
  ↓
[LLM Agent] → Parse intent + Generate tool call
  ↓
  Tool Call: create_expense({
    amount: 500,
    category: "Food",
    description: "lunch",
    date: "2026-02-08"
  })
  ↓
[MCP Tool Registry] → Validate args
  ↓
[Backend Client] → POST /api/expenses
  ↓
[Backend DB] → Insert expense record
  ↓
[Response] ← "✅ Added ₹500 for Food on 2026-02-08"
```

**Key Points**:
- LLM extracts structured args from natural language
- MCP tool validates and executes
- Backend handles persistence
- Single request-response cycle

---

### Flow 2: RAG Question Answering

```
User: "What did I spend on groceries in my bank statement?"
  ↓
[/ai/chat] → Auth + Validation + TraceID
  ↓
[Intent Router] → Classify → RAG_QA
  ↓
[RAG QA Handler]
  ↓
  [1. Query Embedding]
    - Generate embedding for "groceries spending bank statement"
  ↓
  [2. Vector Search]
    - Cosine similarity against stored chunks
    - Filter by userId
    - Top 5 chunks retrieved
  ↓
  [3. Context Assembly]
    - Format chunks with [Source 1], [Source 2], etc.
  ↓
  [4. LLM Generation]
    - RAG prompt: "Answer based ONLY on context"
    - Include citations
  ↓
[Response] ← "Based on your bank statement [Source 1], you spent ₹3,450 on groceries..."
```

**Key Points**:
- No tool calling (read-only operation)
- Vector similarity search for retrieval
- LLM grounded in retrieved context
- Citations for transparency

---

### Flow 3: PDF vs App Comparison

```
User: "Compare my PDF with tracked expenses"
  ↓
[Intent Router] → RAG_COMPARE
  ↓
[RAG Compare Handler]
  ↓
  [1. Extract PDF Expenses]
    - getAllChunks() → user-filtered
    - Parse expenses from chunks
  ↓
  [2. Fetch App Expenses]
    - GET /api/expenses via backend client
  ↓
  [3. Normalize Both Datasets]
    - Date format: YYYY-MM-DD
    - Amount: float
    - Description: lowercase
  ↓
  [4. Compute Diff (Code-based)]
    - Match by amount + date + description similarity
    - Output:
      * matched: []
      * pdf_only: []
      * app_only: []
      * summary: {}
  ↓
  [5. LLM Explanation (Optional)]
    - Generate natural language summary
  ↓
[Response] ← Structured diff OR explained summary
```

**Key Points**:
- **Diff is computed in code, NOT by LLM**
- LLM only explains results (interpretation layer)
- Deterministic comparison logic
- Can return structured or explained output

---

### Flow 4: Sync/Reconcile (Full Workflow)

```
User: "Sync my PDF expenses and generate report"
  ↓
[Intent Router] → SYNC_RECONCILE
  ↓
[Sync/Reconcile Handler]
  ↓
┌──────────────────────────────────────────────┐
│ STAGE 1: COMPARE                             │
│ • Call handleRagCompare(returnStructured)    │
│ • Get: {matched, pdf_only, app_only}         │
└──────────────────┬───────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│ STAGE 2: PLAN (Deterministic)                │
│ • Validate each pdf_only expense             │
│ • Validate each app_only expense             │
│ • Generate plan:                             │
│   - to_app: [expenses to add via MCP]        │
│   - to_pdf: [expenses to add to PDF]         │
│ • Log plan                                   │
└──────────────────┬───────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│ STAGE 3: VALIDATE                            │
│ • Check user has PDFs                        │
│ • Check plan non-empty                       │
│ • Check auth token valid                     │
└──────────────────┬───────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│ STAGE 4: EXECUTE                             │
│ For each expense in to_app:                  │
│   • Call create_expense MCP tool             │
│   • Log result (success/error)               │
│   • Continue on partial failure              │
└──────────────────┬───────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│ STAGE 5: REPORT                              │
│ • Generate HTML/CSV report                   │
│ • Include synced expenses + summary          │
│ • Save to data/reports/synced_XXX.html       │
└──────────────────┬───────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│ STAGE 6: RESPOND                             │
│ • "✅ Synced N expenses to app"              │
│ • "📄 Report: /ai/reports/XXXXX.html"        │
│ • Include any errors                         │
└──────────────────────────────────────────────┘
```

**Key Points**:
- Multi-stage orchestration
- **No LLM decides what to sync** (deterministic planner)
- Graceful partial failure handling
- Audit trail via reports
- Additive-only (never deletes)

---

## Custom → Framework Mapping

| **Custom Component** | **LangChain/LangGraph Equivalent** | **Notes** |
|----------------------|-----------------------------------|-----------|
| **Intent Router** | LangGraph conditional routing node | Currently uses LLM classification → Can be a router node with LLM-based edge selection |
| **Transactional Handler** | LangGraph workflow with tool-calling node | Single-stage workflow: route → agent → tools → respond |
| **LLM Agent (agent.js)** | `create_react_agent()` or custom LangGraph loop | Implements tool-calling loop with max iterations |
| **MCP Tools** | LangChain `@langchain/core/tools` | Each tool becomes a `StructuredTool` with validation |
| **System Prompt** | LangChain `ChatPromptTemplate` | Structured prompt with variables (date, instructions, etc.) |
| **RAG Chunking** | `RecursiveCharacterTextSplitter` | LangChain's semantic splitter with overlap |
| **Embeddings** | `OpenAIEmbeddings` | Direct 1:1 mapping |
| **Vector Store** | LangChain vector store (in-memory or Faiss) | Replace custom JSON with LangChain vector abstraction |
| **RAG Retrieval** | `VectorStoreRetriever` | Built-in similarity search with top-k |
| **RAG Generation** | RetrievalQA chain or custom chain | Prompt + context + LLM |
| **Comparison Engine** | Standalone utility (keep as-is) | No framework needed - pure JS logic |
| **Reconciliation Planner** | LangGraph multi-step workflow | Graph with nodes: compare → plan → validate → execute → report |
| **Logging** | LangSmith tracing | Automatic tracing of all steps |
| **Error Handling** | LangChain error callbacks | Built-in error propagation |
| **Cost Tracking** | LangSmith usage tracking | Automatic token counting |
| **Backend Client** | Remain as utility | No change - HTTP client stays |

---

## Component Deep Dive

### 1. Intent Router

**Current Implementation**:
```javascript
// Uses LLM to classify intent
const intent = await classifyIntent(userMessage);
// Routes to appropriate handler
switch(intent) {
  case 'TRANSACTIONAL': return handleTransactional(...);
  case 'RAG_QA': return handleRagQA(...);
  ...
}
```

**LangGraph Equivalent**:
```javascript
// Define routing logic as conditional edge
const workflow = new StateGraph({
  channels: {
    intent: { reducer: (x) => x },
    message: { reducer: (x) => x },
    response: { reducer: (x) => x }
  }
});

// Classification node
workflow.addNode("classify_intent", classifyIntentNode);

// Handler nodes
workflow.addNode("transactional", transactionalNode);
workflow.addNode("rag_qa", ragQaNode);
workflow.addNode("rag_compare", ragCompareNode);
workflow.addNode("sync_reconcile", syncReconcileNode);

// Conditional routing
workflow.addConditionalEdges(
  "classify_intent",
  (state) => state.intent, // Route based on intent
  {
    "TRANSACTIONAL": "transactional",
    "RAG_QA": "rag_qa",
    "RAG_COMPARE": "rag_compare",
    "SYNC_RECONCILE": "sync_reconcile"
  }
);
```

**Why LangGraph is Better Here**:
- ✅ Visualization of routing logic
- ✅ Built-in state management
- ✅ Easier to add new intents
- ✅ Automatic tracing via LangSmith

---

### 2. MCP Tools

**Current Implementation**:
```javascript
// ai/src/mcp/tools/createExpense.js
export const createExpenseTool = {
  definition: {
    type: "function",
    function: {
      name: "create_expense",
      description: "Creates a new expense",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number" },
          category: { type: "string" },
          ...
        },
        required: ["amount"]
      }
    }
  },
  run: async (args, token) => {
    // Validate, call backend API, return result
  }
};
```

**LangChain Equivalent**:
```javascript
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

class CreateExpenseTool extends StructuredTool {
  name = "create_expense";
  description = "Creates a new expense in the tracker";
  
  schema = z.object({
    amount: z.number().positive().describe("Expense amount"),
    category: z.string().describe("Expense category"),
    description: z.string().optional(),
    date: z.string().optional()
  });
  
  async _call(input) {
    // Validation happens automatically via zod
    // Call backend API
    // Return result
  }
}
```

**Why LangChain is Better Here**:
- ✅ Built-in zod validation
- ✅ Automatic OpenAI function schema conversion
- ✅ Better TypeScript/type safety
- ✅ Integrates with LangSmith for automatic tracing

---

### 3. RAG Pipeline

**Current Implementation**:
```javascript
// Upload: PDF → Extract → Chunk → Embed → Store
const text = await extractText(pdf);
const chunks = chunkText(text);
const embeddings = await generateEmbeddings(chunks);
await storeInVectorDB(embeddings);

// Query: Question → Embed → Search → Generate
const queryEmbedding = await generateEmbedding(question);
const results = await searchSimilar(queryEmbedding);
const answer = await llm.generate(prompt + context);
```

**LangChain Equivalent**:
```javascript
// Upload: Use document loaders + text splitters
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

const loader = new PDFLoader(pdfPath);
const docs = await loader.load();

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 50
});
const chunks = await splitter.splitDocuments(docs);

const embeddings = new OpenAIEmbeddings();
const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

// Query: Use retrieval chain
import { RetrievalQAChain } from "langchain/chains";

const chain = RetrievalQAChain.fromLLM(
  llm,
  vectorStore.asRetriever(5) // top 5 results
);

const response = await chain.call({ query: question });
```

**Why LangChain is Better Here**:
- ✅ Pre-built document loaders (PDF, DOCX, etc.)
- ✅ Multiple text splitter strategies
- ✅ Vector store abstraction (easy to swap)
- ✅ Built-in retrieval chains
- ✅ Automatic source citation

---

### 4. Reconciliation Workflow

**Current Implementation**:
```javascript
// Sequential stages
const diff = await handleRagCompare(..., {returnStructured: true});
const plan = await createReconciliationPlan(diff);
await validatePrerequisites(plan);
const results = await executeSyncPlan(plan);
const report = await generateReport(results);
return summarize(report);
```

**LangGraph Equivalent**:
```javascript
// Define as state graph
const workflow = new StateGraph({
  channels: {
    diff: { reducer: (x) => x },
    plan: { reducer: (x) => x },
    results: { reducer: (x) => x },
    report: { reducer: (x) => x }
  }
});

workflow.addNode("compare", compareNode);
workflow.addNode("plan", planNode);
workflow.addNode("validate", validateNode);
workflow.addNode("execute", executeNode);
workflow.addNode("report", reportNode);

workflow.addEdge("compare", "plan");
workflow.addEdge("plan", "validate");
workflow.addConditionalEdges("validate", 
  (state) => state.validated ? "execute" : "error"
);
workflow.addEdge("execute", "report");
workflow.addEdge("report", END);

const app = workflow.compile();
```

**Why LangGraph is Better Here**:
- ✅ Clear visualization of workflow
- ✅ State propagation between stages
- ✅ Built-in error handling paths
- ✅ Checkpoint support (pause/resume)
- ✅ LangSmith traces entire workflow

---

## Safety & Production Patterns

### Current Safety Mechanisms

| **Pattern** | **Implementation** | **LangChain/LangGraph Equivalent** |
|-------------|-------------------|-----------------------------------|
| **Max Tool Iterations** | `MAX_TOOL_ITERATIONS = 5` | Agent executor `max_iterations` |
| **LLM Timeout** | `LLM_TIMEOUT = 60000ms` | OpenAI client timeout config |
| **Max Response Tokens** | `MAX_RESPONSE_TOKENS = 500` | LLM `maxTokens` parameter |
| **Tool Argument Validation** | Custom JSON schema validator | Zod schema in `StructuredTool` |
| **Tool Execution Timeout** | `executeToolSafely()` with 30s timeout | LangChain callbacks + timeout wrapper |
| **Retry Logic** | Custom retry with exponential backoff | `@langchain/core` retry config |
| **Rate Limiting** | Express `express-rate-limit` | Keep as-is (middleware) |
| **User Isolation** | userId propagated through context | Add userId to state/metadata |
| **Cost Tracking** | Custom usage logger | LangSmith automatic tracking |
| **Structured Logging** | Winston-style logger with traceId | LangSmith traces |
| **Error Classification** | `errorClassification.js` | LangChain error callbacks |

### Safety Philosophy

**Core Principle**: **LLM for interpretation, Code for decisions**

| **Responsibility** | **LLM** | **Code** |
|-------------------|---------|----------|
| Intent understanding | ✅ | ❌ |
| Natural language parsing | ✅ | ❌ |
| Tool argument extraction | ✅ | ❌ |
| **Financial decisions** | ❌ | ✅ |
| **Data reconciliation** | ❌ | ✅ |
| **Validation** | ❌ | ✅ |
| **Execution** | ❌ | ✅ |
| Explanation/summarization | ✅ | ❌ |

**Why This Matters**:
- LLMs are probabilistic → cannot be trusted with critical operations
- Business rules must be deterministic and version-controlled
- Audit compliance requires traceable logic
- Cost explosion risk if LLM makes recursive decisions

---

## Migration Strategy

### Phase 1: Foundation (Week 1)

**Goals**: 
- Set up LangChain/LangGraph/LangSmith environment
- Create equivalent tool wrappers
- Implement basic chat flow

**Tasks**:
1. Initialize `ai-langx/` with package.json
2. Install dependencies:
   - `@langchain/core`
   - `@langchain/openai`
   - `@langchain/langgraph`
   - `langsmith`
3. Create LangChain tools for all 5 MCP tools
4. Implement basic agent executor
5. Test single tool calling flow

**Success Criteria**:
- Can execute "add ₹500 for lunch" end-to-end
- LangSmith trace visible
- Tool validation working

---

### Phase 2: RAG Implementation (Week 2)

**Goals**:
- Implement RAG pipeline using LangChain components
- Achieve parity with existing RAG functionality

**Tasks**:
1. PDF loader + text splitter
2. Embeddings + vector store (in-memory first)
3. Retrieval QA chain
4. Comparison engine (keep existing code)
5. Test RAG queries

**Success Criteria**:
- Can upload PDF and query it
- Can compare PDF vs App expenses
- Results match existing implementation

---

### Phase 3: Workflows (Week 3)

**Goals**:
- Implement multi-stage workflows using LangGraph
- Reconciliation pipeline

**Tasks**:
1. Intent router as LangGraph conditional edges
2. Reconciliation workflow as state graph
3. Error handling paths
4. Partial failure recovery

**Success Criteria**:
- Can sync PDF expenses end-to-end
- Workflow visible in LangSmith
- Error scenarios handled gracefully

---

### Phase 4: Observability (Week 4)

**Goals**:
- Full LangSmith integration
- Production monitoring

**Tasks**:
1. Configure LangSmith traces for all flows
2. Add custom tags and metadata
3. Cost tracking dashboards
4. Performance analysis

**Success Criteria**:
- Every request traced in LangSmith
- Can debug failures from traces
- Cost per request visible

---

### Phase 5: Documentation (Week 5)

**Goals**:
- Create comprehensive comparison guide
- Educational resources

**Tasks**:
1. Write architecture comparison doc
2. Create flow diagrams (old vs new)
3. Document trade-offs
4. Write migration guide

**Success Criteria**:
- Clear guidance on when to use custom vs framework
- Diagrams explain both approaches
- Code is well-commented

---

## Key Takeaways

### When to Use Custom Implementation

✅ **Use Custom When**:
- You need 100% control over execution flow
- Framework overhead is unacceptable
- Business logic is highly specific
- You want minimal dependencies
- You need fine-grained cost control

### When to Use LangChain/LangGraph

✅ **Use Framework When**:
- You want rapid prototyping
- You need built-in observability
- You want community-tested components
- You'll swap LLM providers frequently
- You want automatic tracing
- Team is familiar with the framework

### Hybrid Approach (Recommended)

The best production systems often use **both**:
- LangChain/LangGraph for orchestration and RAG
- Custom code for critical business logic
- Keep deterministic operations out of LLM
- Use frameworks where they add value

**Example**:
```
LangGraph Workflow:
  ├─ Node 1: Intent classification (LangChain agent)
  ├─ Node 2: Execute tools (LangChain tools)
  ├─ Node 3: Reconciliation logic (CUSTOM CODE - no LLM)
  └─ Node 4: Generate report (LangChain chain)
```

---

## Next Steps

1. ✅ Complete this analysis document
2. 🔄 Design ai-langx/ folder structure
3. 🔄 Implement Phase 1: Foundation
4. 🔄 Implement Phase 2: RAG
5. 🔄 Implement Phase 3: Workflows
6. 🔄 Add LangSmith integration
7. 🔄 Write comparison documentation

Ready to proceed with implementation! 🚀
