# 🔍 PRINCIPAL ENGINEER AUDIT REQUEST

You are acting as a PRINCIPAL ENGINEER performing a final technical and functional audit.

This is NOT a code generation task.
This is a deep verification and gap-analysis task.

The repository "expense-tracker" contains:
- frontend/   → Angular app (already working)
- backend/    → Node.js + Express + SQLite APIs (already working)
- ai/         → AI Orchestrator (recently implemented)

Your goal is to VERIFY that the AI Orchestrator implementation fully satisfies
ALL functional, architectural, safety, and demo requirements.

------------------------------------------------------------------
PART 1 — ARCHITECTURE COMPLIANCE CHECK
------------------------------------------------------------------

Verify and report:
- Is /ai/chat the ONLY AI entry point?
- Is intent routing implemented BEFORE execution?
- Are routes limited to:
  TRANSACTIONAL
  RAG_QA
  RAG_COMPARE
  CLARIFICATION
- Is routing separated from execution?
- Is the router NOT acting as a full autonomous agent?

For each item:
- CONFIRMED / PARTIAL / MISSING
- Reference exact files and lines

------------------------------------------------------------------
PART 2 — MCP & BACKEND ISOLATION
------------------------------------------------------------------

Verify:
- AI code NEVER accesses database directly
- All backend interactions go through MCP tools
- MCP tools are deterministic and auditable
- Input validation exists in MCP layer
- Error handling exists and is safe

Report any violations with file references.

------------------------------------------------------------------
PART 3 — TRANSACTIONAL AI FLOW
------------------------------------------------------------------

Verify:
- Natural language → structured intent extraction
- Deterministic mapping to MCP tools
- Safe handling of ambiguous or invalid user inputs
- No business logic inside LLM prompts
- Clear separation between interpretation and execution

Provide concrete examples found in code.

------------------------------------------------------------------
PART 4 — RAG INGESTION PIPELINE
------------------------------------------------------------------

Verify:
- PDF upload endpoint exists
- Text extraction preserves page metadata
- Chunking:
  - 300–500 token size
  - overlap implemented
- Metadata attached to chunks (user_id, document_id)
- Embeddings generated once and reused

Flag any deviation from RAG best practices.

------------------------------------------------------------------
PART 5 — VECTOR STORE & RETRIEVAL
------------------------------------------------------------------

Verify:
- Vector storage exists (in-memory or FAISS)
- Similarity search is implemented
- Filtering by user_id / document_id
- Top-K retrieval is configurable

Assess scalability risks and note them.

------------------------------------------------------------------
PART 6 — RAG QUERY & AUGMENTATION
------------------------------------------------------------------

Verify:
- Query embedding is generated
- Similarity search precedes generation
- Retrieved chunks are used as context
- Prompt augmentation is visible in code
- Citations or sources are included in responses

Explain hallucination risk level based on implementation.

------------------------------------------------------------------
PART 7 — PDF vs APP DATA COMPARISON
------------------------------------------------------------------

Verify:
- Comparison logic is implemented in code (not LLM)
- App data is fetched via MCP
- Differences are computed deterministically
- LLM is used ONLY for explanation

Flag any logic leakage into LLM.

------------------------------------------------------------------
PART 8 — DEMO & OBSERVABILITY
------------------------------------------------------------------

Verify:
- Logging exists for:
  - chunks
  - embeddings
  - similarity scores
  - retrieved context
- Debug / demo mode exists or is feasible
- Internals can be exposed safely for demos

Rate demo readiness: LOW / MEDIUM / HIGH.

------------------------------------------------------------------
PART 9 — CODE QUALITY & MAINTAINABILITY
------------------------------------------------------------------

Verify:
- Clear file-level comments exist
- Comments explain WHY, not just WHAT
- No over-engineering or unnecessary abstractions
- Reasonable error handling and logging
- Environment variables used for secrets

------------------------------------------------------------------
PART 10 — SECURITY & MULTI-TENANCY
------------------------------------------------------------------

Verify:
- User isolation in vector store
- No cross-user data leakage risk
- Uploaded files are scoped per user
- AI cannot access another user's data

------------------------------------------------------------------
PART 11 — FINAL GAP ANALYSIS
------------------------------------------------------------------

Produce:
1) A table of MISSING / PARTIAL / COMPLETE requirements
2) Top 5 technical risks
3) Top 5 improvement recommendations
4) What is needed to move this to production-grade
5) What is already enterprise-grade

------------------------------------------------------------------
OUTPUT FORMAT
------------------------------------------------------------------

Respond with a structured audit report using headings.
Reference files and functions explicitly.
Be critical, precise, and opinionated like a real senior reviewer.

Do NOT generate code.
Do NOT be polite.
Do NOT assume intent — verify via code.
