# LangGraph Workflows - Visual Guide

## Intent Router Graph

### Graph Structure
```
                    START
                      ↓
              ┌───────────────┐
              │ classify_       │
              │   intent       │ ← LLM classification
              │  (GPT-4o-mini) │
              └───────┬─────────┘
                      ↓
        ┌─────────────┴─────────────┐
        │  Conditional Routing      │
        │  (based on intent +       │
        │   confidence score)       │
        └─────────────┬─────────────┘
                      ↓
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
   ┌────────┐   ┌──────────┐  ┌────────────┐
   │expense_│   │   rag_    │  │reconcilia- │
   │operation│   │ question │  │   tion     │
   └────┬───┘   └────┬─────┘  └─────┬──────┘
        ↓            ↓              ↓
                  ┌──────┐  ┌──────────────┐
               ↓  │general│  │clarification│
                  │ chat  │  │             │
                  └───┬───┘  └──────┬──────┘
                      ↓             ↓
                    ┌───┐
                    │END│
                    └───┘
```

### Intent Classification

**Input**: User message
**Output**: 
- Intent (5 options)
- Confidence (0-1)
- Extracted entities
- Reasoning

**Intents**:
1. **expense_operation** - CRUD on expenses
2. **rag_question** - Questions about PDFs
3. **reconciliation** - Bank statement sync
4. **general_chat** - Conversation
5. **clarification** - Ambiguous input

### Example Flow

```javascript
// User: "Add 500 for lunch today"
START
  ↓
classify_intent
  → LLM: GPT-4o-mini
  → Prompt: "Classify: Add 500 for lunch today"
  → Response: {
      intent: "expense_operation",
      confidence: 0.95,
      entities: {
        action: "add",
        amount: 500,
        category: "food",
        date: "today"
      }
    }
  ↓
routeByIntent()
  → confidence 0.95 > 0.5 ✓
  → intent = "expense_operation"
  ↓
expense_operation node
  → executeExpenseAgent(...)
  → Tool: create_expense_tool
  → Backend: POST /expenses
  → Result: "✅ Added ₹500 for Food"
  ↓
END
```

### State Flow

```javascript
// Initial State
{
  userMessage: "Add 500 for lunch today",
  userId: 123,
  authToken: "eyJ...",
  conversationHistory: []
}

// After classify_intent
{
  ...previousState,
  intent: "expense_operation",
  confidence: 0.95,
  reasoning: "User wants to add an expense",
  entities: { action: "add", amount: 500, ... }
}

// After expense_operation
{
  ...previousState,
  result: "✅ Successfully added ₹500 for Food on 2026-02-08",
  toolCalls: [{ tool: "create_expense_tool", args: {...} }]
}

// Final Output
{
  reply: "✅ Successfully added ₹500 for Food on 2026-02-08",
  metadata: {
    intent: "expense_operation",
    confidence: 0.95
  }
}
```

---

## Reconciliation Graph

### Graph Structure
```
                    START
                      ↓
              ┌───────────────┐
              │  initialize   │
              │  (validate    │
              │   inputs)     │
              └───────┬───────┘
                      ↓
              ┌───────────────┐
              │ fetch_app     │
              │   expenses    │ ← GET /expenses (with retry)
              └───────┬───────┘
                      ↓
              ┌───────────────┐
              │ fetch_pdf     │
              │   receipts    │ ← getUserDocuments()
              └───────┬───────┘
                      ↓
              ┌───────────────┐
              │  compare_     │
              │ bank_vs_app   │ ← Match algorithm
              └───────┬───────┘
                      ↓
         ┌────────────┴────────────┐
         ↓ (if PDFs exist)         ↓ (skip)
   ┌──────────┐            ┌───────────────┐
   │compare_  │            │  analyze_     │
   │bank_vs_  │→───────────→│ discrepancies│ ← LLM analysis
   │   pdf    │            │               │
   └──────────┘            └───────┬───────┘
                                   ↓
                      ┌────────────┴────────────┐
                      ↓ (if autoSync)           ↓ (skip)
                ┌──────────┐            ┌──────────────┐
                │auto_sync │            │generate_     │
                │          │→───────────→│   report     │
                └──────────┘            └───────┬──────┘
                                                ↓
                                            ┌───┐
                                            │END│
                                            └───┘
```

### Matching Algorithm

**Calculate Match Score (0-1)**:
- Amount match: 40% weight
- Date match: 30% weight (±7 days tolerance)
- Description similarity: 30% weight (Jaccard index)

**Classification**:
- 0.9+ = **Exact match**
- 0.7-0.9 = **Probable match**
- 0.5-0.7 = **Fuzzy match** (flagged as discrepancy)
- <0.5 = **No match** (missing_in_app discrepancy)

### Example Flow

```javascript
// User submits 3 bank transactions
START
  ↓
initialize
  → Validate bankStatementData: 3 transactions ✓
  → Set stage: "fetch_app_expenses"
  ↓
fetch_app
  → GET http://localhost:3000/expenses
  → Headers: { Authorization: "Bearer ..." }
  → Response: { expenses: [2 expenses] }
  → Set appExpenses: [2 items]
  → Set stage: "fetch_pdf_receipts"
  ↓
fetch_pdf
  → getUserDocuments(userId: 123)
  → Found: 50 PDF chunks
  → Set pdfReceipts: [50 items]
  → Set stage: "compare_bank_vs_app"
  ↓
compare (bank vs app)
  → Bank TX 1: "Restaurant XYZ" ₹500
    → Match with App Expense 1: "Lunch" ₹500
    → Score: 0.95 → EXACT match ✓
  
  → Bank TX 2: "Uber Ride" ₹200
    → Match with App Expense 2: "Transport" ₹200
    → Score: 0.88 → PROBABLE match ✓
  
  → Bank TX 3: "Unknown Store" ₹300
    → No good match (best score: 0.3)
    → Discrepancy: MISSING_IN_APP ⚠️
  
  → Set matches: [2]
  → Set discrepancies: [1 missing_in_app]
  → Set stage: "compare_bank_vs_pdf" (PDFs exist)
  ↓
compare_pdf
  → For discrepancy: "Unknown Store" ₹300
    → Search PDFs: retrieveDocuments("Unknown Store 300", userId)
    → Found match in receipt.pdf (similarity: 0.85)
    → Update discrepancy severity: high → low
  → Set stage: "analyze_discrepancies"
  ↓
analyze
  → LLM prompt with discrepancies
  → GPT-4o-mini analysis
  → Summary: "2 matches, 1 missing (has receipt)"
  → Suggested action: Add "Unknown Store" expense
  → Set stage: "generate_report" (autoSync = false)
  ↓
report
  → Compile final report:
    {
      statistics: { matched: 2, discrepancies: 1, matchRate: 0.67 },
      matches: [...],
      discrepancies: [...],
      suggestedActions: [{ action: "add_expense", ... }]
    }
  → Set stage: "complete"
  ↓
END
```

### State Progression

```javascript
// Stage 1: Initialize
{
  userId: 123,
  bankStatementData: [3 transactions],
  stage: "init"
}

// Stage 2: After fetch_app
{
  ...previous,
  appExpenses: [2 expenses],
  stage: "fetch_pdf_receipts"
}

// Stage 3: After fetch_pdf
{
  ...previous,
  pdfReceipts: [50 chunks],
  stage: "compare_bank_vs_app"
}

// Stage 4: After compare
{
  ...previous,
  matches: [
    { bankTransaction: {...}, appExpense: {...}, matchScore: 0.95 }
  ],
  discrepancies: [
    { type: "missing_in_app", bankTransaction: {...}, severity: "high" }
  ],
  totalMatched: 2,
  totalDiscrepancies: 1,
  stage: "compare_bank_vs_pdf"
}

// Stage 5: After analyze
{
  ...previous,
  summary: "2 of 3 matched...",
  suggestedActions: [
    { action: "add_expense", target: {...}, reason: "..." }
  ],
  stage: "generate_report"
}

// Final: Report
{
  ...previous,
  result: {
    summary: "...",
    statistics: {...},
    matches: [...],
    discrepancies: [...],
    suggestedActions: [...]
  },
  stage: "complete"
}
```

---

## Error Handling

### Intent Router
```
classify_intent
  → LLM error? → Fallback to keyword matching
  → Confidence < 0.5 → Route to clarification
```

### Reconciliation
```
fetch_app
  → API error? → Retry (max 3)
  → Still failing? → Set stage: "error"

fetch_pdf
  → Error? → Continue with empty array (PDFs optional)

compare_pdf
  → Error? → Continue without PDF comparison
```

---

## Performance Characteristics

### Intent Router
- **Latency**: 500-2000ms (depends on LLM + handler)
- **LLM calls**: 1 (classification)
- **Nodes executed**: 2 (classify + handler)

### Reconciliation
- **Latency**: 3-10s (depends on data volume)
- **LLM calls**: 1 (analysis) + optional (multi-query in PDF compare)
- **Nodes executed**: 6-8 (depending on conditional branches)
- **API calls**: 1-2 (fetch app, optional PDF search)

---

## Debugging with LangSmith

When `LANGCHAIN_TRACING_V2=true`:

### Intent Router Trace
```
Run: intent-router-graph-1234567890
├─ Node: classify_intent (520ms)
│  ├─ Tool: ChatOpenAI
│  │  └─ Prompt: "Classify: Add 500 for lunch"
│  │  └─ Response: {"intent": "expense_operation", ...}
│  │  └─ Tokens: 150 input, 80 output
│  └─ State update: { intent, confidence, entities }
└─ Node: expense_operation (1150ms)
   ├─ Agent: expense-agent
   │  ├─ Tool: create_expense_tool
   │  │  └─ Args: {amount: 500, category: "Food", ...}
   │  │  └─ Result: {id: 42, ...}
   │  └─ Response: "✅ Added expense"
   └─ State update: { result }
```

### Reconciliation Trace
```
Run: reconciliation-graph-1234567890
├─ Node: initialize (8ms)
├─ Node: fetch_app (280ms)
│  └─ HTTP: GET /expenses [200]
├─ Node: fetch_pdf (120ms)
│  └─ vectorStore.getUserDocuments
├─ Node: compare (750ms)
│  └─ calculateMatchScore × 6
├─ Node: compare_pdf (420ms)
│  └─ retrieveDocuments × 1
├─ Node: analyze (1100ms)
│  └─ ChatOpenAI
│     └─ Tokens: 800 input, 200 output
└─ Node: report (15ms)
```

---

## Adding New Nodes

### Intent Router - Add New Intent
```javascript
// 1. Update state schema
intent: z.enum([..., 'new_intent'])

// 2. Create handler
const handleNewIntent = async (state) => {
  // Your logic
  return { result: "..." };
};

// 3. Add to graph
workflow.addNode("new_intent", handleNewIntent);

// 4. Update routing
case 'new_intent': return 'new_intent';

// 5. Add edge
workflow.addEdge("new_intent", END);
```

### Reconciliation - Add New Stage
```javascript
// 1. Add to stage enum
stage: z.enum([..., 'new_stage'])

// 2. Create node
const newStageNode = async (state) => {
  // Your logic
  return { stage: 'next_stage' };
};

// 3. Add to graph
workflow.addNode("new_stage", newStageNode);

// 4. Add edges
workflow.addEdge("previous_stage", "new_stage");
workflow.addEdge("new_stage", "next_stage");
```

---

## Best Practices

### State Design
- ✅ Use Zod for type safety
- ✅ Keep state flat (avoid deep nesting)
- ✅ Use optional fields for conditional data
- ✅ Include metadata (traceId, timestamp)

### Node Functions
- ✅ Pure functions (no side effects outside state)
- ✅ Return partial state updates
- ✅ Handle errors gracefully
- ✅ Log important decisions

### Routing
- ✅ Use conditional edges for dynamic routing
- ✅ Always have error paths
- ✅ Avoid cycles (unless intentional)
- ✅ Keep routing logic simple

### Performance
- ✅ Minimize LLM calls
- ✅ Cache expensive operations
- ✅ Use parallel execution where possible
- ✅ Set timeouts on external calls

---

**See**: [PHASE_3_LANGGRAPH.md](./PHASE_3_LANGGRAPH.md) for complete documentation
