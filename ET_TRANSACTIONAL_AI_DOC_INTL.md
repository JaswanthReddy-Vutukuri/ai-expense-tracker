# 🧠 ENTERPRISE-GRADE AI + RAG EXECUTION PLAN

Absolutely. Below is a **finalized, enterprise-grade execution plan** that consolidates *everything we discussed*, removes ambiguity, and gives you a **clear build + demo roadmap**.

This is written the way a **staff/principal engineer** would document it before execution.

---

## Enterprise-Grade AI + RAG Execution Plan

### *Expense Tracker with Transactional AI + Document Intelligence*

---

## 0️⃣ Guiding Principles (Non-Negotiable)

These principles drive every design choice:

1. **Separation of concerns**

   * AI ≠ business logic
   * AI ≠ database
   * AI ≠ backend replacement

2. **Deterministic where possible**

   * CRUD → deterministic MCP tools
   * RAG → controlled, explainable

3. **Agent ≠ magic**

   * Agent is a **router / planner**, not a decision-maker

4. **Demoability**

   * Every “AI concept” must be visible and explainable:

     * chunks
     * embeddings
     * vectors
     * retrieval
     * augmentation

---

## 1️⃣ Final Architecture Overview

### Monorepo Structure (Final)

```
expense-tracker/
├── frontend/        # Angular app
├── backend/         # Node + Express + SQLite
├── ai/              # AI Orchestrator (existing)
│   ├── chat/        # Entry point
│   ├── router/      # NEW – intent router
│   ├── mcp/         # Transactional tools
│   ├── rag/         # NEW – RAG pipeline
│   ├── llm/         # LLM abstraction
│   ├── ingest/      # PDF ingestion pipeline
│   └── demo/        # NEW – demo visualizations
```

---

## 2️⃣ High-Level Request Flow (FINAL)

```
User → /ai/chat
          ↓
     Intent Router (Agent)
          ↓
   ┌──────────────────────┐
   │ TRANSACTIONAL (MCP)  │  → CRUD APIs
   │ RAG_QA               │  → PDF Q&A
   │ RAG_COMPARE          │  → PDF vs App
   │ CLARIFICATION        │
   └──────────────────────┘
```

---

## 3️⃣ Intent Router (Agent) — FINAL DESIGN

### Purpose

Decide **which pipeline** should handle the query.

### Inputs

* User message
* Conversation context (lightweight)

### Output (STRICT)

```json
{
  "route": "TRANSACTIONAL | RAG_QA | RAG_COMPARE | CLARIFICATION",
  "confidence": 0.92
}
```

### What the Router DOES

✅ Classify intent
✅ Decide pipeline
✅ Ask clarification if ambiguous

### What the Router NEVER Does

❌ Call APIs
❌ Perform RAG
❌ Execute tools
❌ Maintain long-term memory

---

### Router Strategy (Enterprise-Grade)

#### Tier 1: Rules (Fast, Free)

```txt
If message contains:
- upload, pdf, document, statement → RAG
- compare, mismatch, reconcile → RAG_COMPARE
- add, delete, update, list → TRANSACTIONAL
```

#### Tier 2: Lightweight LLM Classifier

* Small model
* <50 tokens
* Cached per message hash

---

## 4️⃣ Transactional Flow (Already Implemented)

### Use Cases

* Add / update / delete expense
* List expenses
* Dashboard summary

### Pipeline

```
User → LLM → MCP Tool → Backend → Response
```

### Properties

* Fast
* Cheap
* Deterministic
* Auditable

### Tools

* create_expense
* list_expenses
* update_expense
* delete_expense

---

## 5️⃣ RAG Flow (Document Intelligence)

This is where enterprise value comes in.

---

## 6️⃣ PDF Ingestion Pipeline (Async)

### Step 1: Upload

```
Frontend → /ai/rag/upload
```

* Store raw PDF (S3 / local FS)
* Generate `document_id`
* Trigger background job

---

### Step 2: Text Extraction

* pdfplumber / Tika
* Preserve:

  * page number
  * line structure

---

### Step 3: Chunking (Critical)

| Parameter  | Value          |
| ---------- | -------------- |
| Chunk size | 300–500 tokens |
| Overlap    | 50–100 tokens  |

Example chunk:

```json
{
  "chunk_id": "doc1_p1_c3",
  "text": "01 Jan Grocery Store ₹450",
  "page": 1
}
```

---

### Step 4: Metadata Enrichment

```json
{
  "user_id": 123,
  "document_id": "jan_2026.pdf",
  "source": "pdf",
  "category": "food",
  "amount": 450,
  "date": "2026-01-01"
}
```

This enables **filtering + comparison**.

---

### Step 5: Embeddings

```
Text → Tokens → Embedding → Vector (e.g. 1536 dims)
```

Embeddings stored once, reused many times.

---

### Step 6: Vector Database

**Prod options**

* Pinecone / Qdrant / Weaviate

**Demo option**

* FAISS (local)

Stored:

* Vector
* Text
* Metadata

---

## 7️⃣ RAG Query Flow (FINAL)

### Example Query

> “How much did I spend on food this month from the PDF?”

### Steps

1. Query → embedding
2. Similarity search
3. Metadata filtering (food + date)
4. Retrieve top-K chunks
5. Augment LLM prompt
6. Generate answer with sources

---

## 8️⃣ PDF vs App Data Comparison (Killer Feature)

### Flow

```
Router → RAG_COMPARE
          ↓
Retrieve PDF chunks
          ↓
Fetch app data via MCP tool
          ↓
Structured comparison (code)
          ↓
LLM explanation
```

### Why this is Enterprise-Grade

* AI explains
* System controls logic
* Results are auditable

Example output:

```txt
On 02 Jan:
PDF shows ₹320 (Food)
App shows ₹300 (Food)
Difference: ₹20
```

---

## 9️⃣ AI Orchestrator Responsibilities (Final)

| Layer   | Responsibility         |
| ------- | ---------------------- |
| Router  | Decide pipeline        |
| MCP     | Deterministic actions  |
| RAG     | Knowledge retrieval    |
| LLM     | Explanation, reasoning |
| Backend | Source of truth        |

No layer bleeds into another.

---

## 🔟 Demo Strategy (This Is Critical)

You will **show**, not tell.

---

### 🎬 Demo Part 1: Transactional AI

* Prompt: “Add ₹200 for lunch today”
* Show:

  * Tool selection
  * API call
  * DB update

---

### 🎬 Demo Part 2: RAG Internals (WOW Factor)

Create a **Demo Panel** in UI or logs:

#### 1. Chunk Viewer

```
Chunk ID | Text | Page | Category | Amount
```

#### 2. Token Count

```
Tokens: 142
```

#### 3. Embedding Visualization

* PCA / TSNE plot
* Food expenses cluster together

#### 4. Similarity Search Results

```
Query → Top 5 chunks + scores
```

#### 5. Augmented Prompt

Show:

* System prompt
* Retrieved context
* User question

---

### 🎬 Demo Part 3: Comparison Intelligence

Prompt:

> “Compare my PDF expenses with app data”

Show:

* Retrieved PDF chunks
* App data pulled via MCP
* Differences table
* LLM explanation

This is **enterprise-level credibility**.

---

## 1️⃣1️⃣ Scalability & Production Readiness

### Performance

* Async ingestion
* Cached embeddings
* Route-based execution

### Cost Control

* RAG invoked only when needed
* Reuse embeddings
* Limit K

### Security

* Per-user vector isolation
* Encrypted storage
* No cross-tenant leakage

---

## 1️⃣2️⃣ Why This Design Is Correct

✅ Matches Perplexity-style routing
✅ Avoids agent chaos
✅ Scales horizontally
✅ Easy to debug
✅ Easy to demo
✅ Enterprise-ready

---

## 🧠 Final Verdict

You’re not building:

> “An AI chatbot”

You’re building:

> **A document-aware, auditable financial intelligence system**

This is the **right architecture**, executed the **right way**.

---

### Next Steps (Choose One)

1. Want a **Workik prompt** to implement RAG folder?
2. Want **exact router prompt & schema**?
3. Want a **demo UI wireframe**?
4. Want a **local FAISS demo script**?

Tell me what you want next — you’re doing excellent work 👌
