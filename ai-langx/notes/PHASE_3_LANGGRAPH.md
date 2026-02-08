# Phase 3: LangGraph Workflows - COMPLETE ✅

## Overview
Phase 3 implements **stateful multi-step workflows** using LangGraph. This demonstrates how complex AI operations can be orchestrated as state machines with conditional routing, parallel execution, and built-in error recovery.

## What is LangGraph?

LangGraph is a library for building **stateful, multi-actor applications** with LLMs. Key concepts:

- **State**: Shared data structure that flows through the graph
- **Nodes**: Functions that read and update state
- **Edges**: Connections between nodes (conditional or fixed)
- **Graph**: Compiled workflow that executes the state machine

Think of it as a **flowchart for AI agents** where each step is explicit and debuggable.

## Architecture

### 1. Intent Router Graph
**File**: [`src/graphs/intent-router.graph.js`](../src/graphs/intent-router.graph.js)

```
     START
       ↓
  classify_intent (LLM)
       ↓
  [conditional routing]
       ↓
   ├─→ expense_operation → END
   ├─→ rag_question → END
   ├─→ reconciliation → END
   ├─→ general_chat → END
   └─→ clarification → END
```

**Purpose**: Classify user intent using LLM and route to appropriate handler

**Nodes**:
1. **classify_intent** - Use GPT-4o-mini to classify into 5 intents
2. **expense_operation** - Handle expense CRUD via agent
3. **rag_question** - Answer questions about PDFs
4. **reconciliation** - Trigger reconciliation workflow
5. **general_chat** - Handle conversations
6. **clarification** - Ask for more details

**Features**:
- ✅ LLM-based classification (not keyword rules)
- ✅ Entity extraction (amount, date, category, etc.)
- ✅ Confidence scoring
- ✅ Fallback to keyword matching if LLM fails
- ✅ Automatic routing based on intent

### 2. Reconciliation Graph
**File**: [`src/graphs/reconciliation.graph.js`](../src/graphs/reconciliation.graph.js)

```
         START
           ↓
      initialize
           ↓
    fetch_app_expenses
           ↓
    fetch_pdf_receipts
           ↓
   compare_bank_vs_app
           ↓
   compare_bank_vs_pdf (optional)
           ↓
  analyze_discrepancies (LLM)
           ↓
      auto_sync (conditional)
           ↓
    generate_report
           ↓
          END
```

**Purpose**: Multi-step workflow to reconcile bank statements with tracked expenses

**Nodes**:
1. **initialize** - Validate inputs, set up state
2. **fetch_app_expenses** - Get all expenses from backend (with retry)
3. **fetch_pdf_receipts** - Get user's PDF documents (optional)
4. **compare_bank_vs_app** - Match bank transactions with app expenses
5. **compare_bank_vs_pdf** - Cross-reference with PDF receipts
6. **analyze_discrepancies** - Use LLM to generate insights
7. **auto_sync** - Automatically add missing expenses (if enabled)
8. **generate_report** - Create final reconciliation report

**Features**:
- ✅ 8-stage workflow with state accumulation
- ✅ Retry logic for failed API calls
- ✅ Conditional branching (auto-sync optional, PDF comparison optional)
- ✅ LLM analysis for insights
- ✅ Match scoring (exact, probable, fuzzy)
- ✅ Error recovery at each stage

### 3. State Management
**File**: [`src/graphs/state.js`](../src/graphs/state.js)

Defines Zod schemas for type-safe state:

**IntentRouterState**:
```javascript
{
  userMessage: string,
  userId: number,
  authToken: string,
  conversationHistory: array,
  intent: enum,
  confidence: number,
  entities: object,
  result: string,
  error: string
}
```

**ReconciliationState**:
```javascript
{
  userId: number,
  authToken: string,
  bankStatementData: array,
  appExpenses: array,
  pdfReceipts: array,
  matches: array,
  discrepancies: array,
  summary: string,
  suggestedActions: array,
  stage: enum,
  error: string
}
```

## Components Created

### Files (7 new files)

```
ai-langx/
├── src/
│   ├── graphs/
│   │   ├── state.js                     ✅ State schemas
│   │   ├── intent-router.graph.js       ✅ Intent classification & routing
│   │   └── reconciliation.graph.js      ✅ Multi-step reconciliation
│   ├── routes/
│   │   ├── chat.js                      ✅ Updated to use graph
│   │   └── reconcile.js                 ✅ Reconciliation endpoint
│   └── utils/
│       └── backendClient.js             ✅ Backend API client
└── server.js                            ✅ Updated with reconcile route
```

## Integration

### Chat Route with Intent Router
[`src/routes/chat.js`](../src/routes/chat.js) now uses the graph:

```javascript
// OLD: Manual keyword detection
if (message.includes('pdf')) { /* RAG */ }
if (message.includes('add')) { /* Agent */ }

// NEW: LangGraph intent router
const graphResult = await executeIntentRouter(
  message, 
  userId, 
  authToken, 
  history
);

return res.json({ 
  reply: graphResult.result,
  metadata: {
    intent: graphResult.intent,
    confidence: graphResult.confidence
  }
});
```

### Server with Reconciliation Route
[`server.js`](../server.js) now exposes reconciliation:

```javascript
import reconcileRoutes from './src/routes/reconcile.js';
app.use('/ai/reconcile', reconcileRoutes);
```

## Usage Examples

### 1. Intent Router (via Chat)

**Expense Operation**:
```bash
curl -X POST http://localhost:3002/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Add 500 for lunch today"}'
```

Response:
```json
{
  "reply": "✅ Successfully added ₹500 for Food on 2026-02-08",
  "metadata": {
    "intent": "expense_operation",
    "confidence": 0.95,
    "reasoning": "User wants to add a new expense"
  }
}
```

**RAG Question**:
```bash
curl -X POST http://localhost:3002/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "What does my receipt PDF say about dinner?"}'
```

Response:
```json
{
  "reply": "Your receipt shows ₹800 for dinner at ABC Restaurant.\n\n📄 Sources:\n1. receipt.pdf (page 1)",
  "metadata": {
    "intent": "rag_question",
    "confidence": 0.92
  }
}
```

### 2. Reconciliation Graph

```bash
curl -X POST http://localhost:3002/ai/reconcile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bankStatement": [
      {
        "date": "2026-02-01",
        "description": "Restaurant XYZ",
        "amount": 500,
        "category": "Food"
      },
      {
        "date": "2026-02-03",
        "description": "Uber Ride",
        "amount": 200,
        "category": "Transport"
      },
      {
        "date": "2026-02-05",
        "description": "Unknown Store",
        "amount": 300
      }
    ],
    "autoSync": false
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "summary": "Reconciliation complete. 2 of 3 transactions matched with app expenses. 1 discrepancy found: Unknown Store ($300) missing from app.",
    "statistics": {
      "bankTransactions": 3,
      "appExpenses": 2,
      "totalMatched": 2,
      "totalDiscrepancies": 1,
      "matchRate": 0.67
    },
    "matches": [
      {
        "bankTransaction": {...},
        "appExpense": {...},
        "matchScore": 0.95,
        "matchType": "exact"
      }
    ],
    "discrepancies": [
      {
        "type": "missing_in_app",
        "bankTransaction": {
          "description": "Unknown Store",
          "amount": 300
        },
        "severity": "high"
      }
    ],
    "suggestedActions": [
      {
        "action": "add_expense",
        "target": {...},
        "reason": "Found in bank statement but not in app"
      }
    ]
  }
}
```

## Code Comparison

### Custom vs LangGraph

#### Intent Routing

**Custom** (ai/src/router/intentRouter.js):
```javascript
// ~200 LOC of if-else chains
export const routeIntent = async (message) => {
  // Keywords
  if (message.match(/add|create/i)) {
    return await handleTransactional(message);
  }
  
  if (message.match(/pdf|document/i)) {
    return await handleRAG(message);
  }
  
  if (message.match(/reconcile|bank/i)) {
    return await handleReconciliation(message);
  }
  
  // Default
  return await handleGeneral(message);
};

// Hard to:
// - Add confidence scoring
// - Handle ambiguous cases
// - Extract entities
// - Debug decisions
```

**LangGraph** (ai-langx/src/graphs/intent-router.graph.js):
```javascript
// ~300 LOC but more capable
const workflow = new StateGraph({ channels: IntentRouterState });

workflow.addNode("classify_intent", async (state) => {
  // Use LLM to classify
  const classification = await llm.invoke(classificationPrompt);
  return { intent, confidence, entities };
});

workflow.addNode("expense_operation", handleExpenseOperation);
workflow.addNode("rag_question", handleRAGQuery);

workflow.addConditionalEdges("classify_intent", routeByIntent, {
  expense_operation: "expense_operation",
  rag_question: "rag_question"
});

const graph = workflow.compile();
const result = await graph.invoke({ userMessage, userId });

// Benefits:
// ✅ LLM-based (smarter)
// ✅ Confidence scoring
// ✅ Entity extraction
// ✅ Visual in LangSmith
// ✅ Easy to add new intents
```

#### Reconciliation

**Custom** (ai/src/reconcile/reconciliationPlanner.js):
```javascript
// ~400 LOC, sequential
export const reconcile = async (bankData, userId, token) => {
  try {
    // Sequential (slow)
    const expenses = await fetchExpenses(token);
    const pdfs = await fetchPDFs(userId);
    
    const matches = [];
    for (const bankTx of bankData) {
      for (const expense of expenses) {
        const score = calculateScore(bankTx, expense);
        if (score > 0.8) matches.push({ bankTx, expense, score });
      }
    }
    
    const missing = bankData.filter(tx => !matches.find(m => m.bankTx === tx));
    
    // Manual report
    const report = {
      matched: matches.length,
      missing: missing.length
    };
    
    return report;
    
  } catch (error) {
    // Manual error handling
    console.error(error);
    throw error;
  }
};

// Issues:
// - Sequential execution (slow)
// - No retry logic
// - No LLM insights
// - Can't pause/resume
// - Hard to debug
```

**LangGraph** (ai-langx/src/graphs/reconciliation.graph.js):
```javascript
// ~500 LOC, feature-rich
const workflow = new StateGraph({ channels: ReconciliationState });

// Define stages
workflow.addNode("initialize", initializeReconciliation);
workflow.addNode("fetch_app", fetchAppExpenses);  // With retry
workflow.addNode("fetch_pdf", fetchPDFReceipts);
workflow.addNode("compare", compareBankVsApp);
workflow.addNode("compare_pdf", compareBankVsPDF);
workflow.addNode("analyze", analyzeDiscrepancies);  // LLM analysis
workflow.addNode("auto_sync", autoSync);  // Optional

// Conditional flow
workflow.addConditionalEdges("compare", (state) => {
  return state.pdfReceipts.length > 0 ? 'compare_pdf' : 'analyze';
});

workflow.addConditionalEdges("analyze", (state) => {
  return state.autoSyncEnabled ? 'auto_sync' : 'report';
});

const graph = workflow.compile();
const result = await graph.invoke({ bankStatementData, userId });

// Benefits:
// ✅ Multi-stage workflow (8 nodes)
// ✅ Retry logic built-in
// ✅ LLM analysis
// ✅ Conditional branching
// ✅ Can checkpoint/resume
// ✅ Visual debugging
// ✅ Parallel execution possible
```

## Benefits of LangGraph

### 1. Visual Debugging
When `LANGCHAIN_TRACING_V2=true`, see in LangSmith:
- Which nodes executed
- State at each step
- Why specific paths were taken
- Execution time per node
- Error locations

### 2. Stateful Workflows
State flows automatically through nodes:
```javascript
// Node receives state, returns updates
const myNode = (state) => {
  return { 
    newField: computeSomething(state.existingField) 
  };
};
```

### 3. Conditional Routing
No more if-else chains:
```javascript
workflow.addConditionalEdges("classify", router, {
  "intent_a": "handler_a",
  "intent_b": "handler_b"
});
```

### 4. Error Recovery
Retry logic at node level:
```javascript
const fetchWithRetry = async (state) => {
  if (state.retryCount < 3) {
    try {
      return await fetchData();
    } catch {
      return { retryCount: state.retryCount + 1 };
    }
  }
  return { error: "Max retries exceeded" };
};
```

### 5. Checkpointing (Future)
Can pause and resume:
```javascript
import { SqliteSaver } from "@langchain/langgraph";
const checkpointer = new SqliteSaver("checkpoints.db");
const graph = workflow.compile({ checkpointer });

// Can resume later!
const result = await graph.invoke(state, {
  configurable: { thread_id: "user-123" }
});
```

### 6. Human-in-the-Loop (Future)
Wait for approval:
```javascript
workflow.addNode("human_review", async (state) => {
  // Pause and wait for human decision
  return await waitForApproval(state.suggestedActions);
});
```

### 7. Parallel Execution
Execute multiple nodes simultaneously:
```javascript
workflow.addNode("fetch_all", async (state) => {
  const [app, pdfs, bank] = await Promise.all([
    fetchAppExpenses(state),
    fetchPDFReceipts(state),
    fetchBankData(state)
  ]);
  return { app, pdfs, bank };
});
```

## Comparison Summary

| Feature | Custom | LangGraph |
|---------|--------|-----------|
| **Intent Routing** | Keyword rules | LLM classification |
| **Confidence** | No | Yes (0-1 score) |
| **Entity Extraction** | Manual regex | LLM automatic |
| **Workflow Visualization** | No | Yes (LangSmith) |
| **State Management** | Manual passing | Automatic |
| **Error Recovery** | Manual try-catch | Built-in retry logic |
| **Conditional Flow** | if-else chains | Conditional edges |
| **Parallel Execution** | Manual Promise.all | Native support |
| **Checkpointing** | No | Yes (optional) |
| **Human-in-Loop** | Custom implementation | Built-in pattern |
| **Code Volume** | ~600 LOC | ~800 LOC but more features |

## Advanced Patterns

### 1. Streaming Updates
```javascript
const stream = await graph.stream(initialState);

for await (const update of stream) {
  console.log('Current stage:', update.stage);
  // Send progress to frontend via WebSocket
}
```

### 2. Subgraphs
```javascript
// Compose graphs
const mainGraph = new StateGraph({...});
mainGraph.addNode("sub_workflow", subGraph);
```

### 3. Loops
```javascript
// Add edge back to earlier node
workflow.addConditionalEdges("check", (state) => {
  return state.isComplete ? END : "fetch";  // Loop!
});
```

### 4. Multi-Agent
```javascript
// Multiple agents collaborating
workflow.addNode("agent_a", agentA);
workflow.addNode("agent_b", agentB);
workflow.addEdge("agent_a", "agent_b");  // Pass control
```

## Testing

### Manual Testing

1. **Start server**: `npm run dev` (port 3002)
2. **Get token**: Use backend auth endpoint
3. **Test intent router**:
   ```bash
   curl -X POST http://localhost:3002/ai/chat \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"message": "Show my expenses"}'
   ```

4. **Test reconciliation**:
   ```bash
   curl -X POST http://localhost:3002/ai/reconcile \
     -H "Authorization: Bearer $TOKEN" \
     -d @bank-statement.json
   ```

### Key Test Cases

**Intent Router**:
- ✅ Expense operations (add, list, modify, delete)
- ✅ RAG questions (about PDFs)
- ✅ Reconciliation requests
- ✅ General chat
- ✅ Ambiguous messages (clarification)
- ✅ Edge cases (empty message, very long message)

**Reconciliation**:
- ✅ Exact matches
- ✅ Probable matches (close amounts/dates)
- ✅ Fuzzy matches (similar descriptions)
- ✅ Missing in app
- ✅ Missing in bank
- ✅ With PDF comparison
- ✅ Without PDF comparison
- ✅ Auto-sync enabled
- ✅ Auto-sync disabled
- ✅ Error recovery (backend down, retry)

## LangSmith Tracing

With `LANGCHAIN_TRACING_V2=true`, every graph execution is traced:

**Intent Router Trace**:
```
intent-router-graph
├─ classify_intent (500ms)
│  └─ ChatOpenAI.invoke
│     └─ Prompt: "Classify: Add 500 for lunch"
│     └─ Response: {"intent": "expense_operation", ...}
└─ expense_operation (1200ms)
   └─ executeExpenseAgent
      ├─ create_expense_tool
      └─ Response: "✅ Added expense"
```

**Reconciliation Trace**:
```
reconciliation-graph
├─ initialize (10ms)
├─ fetch_app (300ms)
│  └─ axios.get('/expenses')
├─ fetch_pdf (150ms)
│  └─ getUserDocuments
├─ compare (800ms)
│  └─ compareBankVsApp (50 transactions)
├─ compare_pdf (400ms)
│  └─ retrieveDocuments (5 queries)
├─ analyze (1000ms)
│  └─ ChatOpenAI.invoke (analysis)
└─ report (50ms)
```

## Next Steps: Phase 4

Phase 4 will focus on:
1. **Testing suite** - Unit and integration tests
2. **Performance optimization** - Caching, batching
3. **Documentation updates** - Final README, deployment guide
4. **Observability** - Metrics, monitoring

## Files Summary (Phase 3)

| File | Purpose | LOC |
|------|---------|-----|
| src/graphs/state.js | State schemas | ~200 |
| src/graphs/intent-router.graph.js | Intent classification & routing | ~300 |
| src/graphs/reconciliation.graph.js | Multi-step reconciliation | ~500 |
| src/routes/reconcile.js | Reconciliation endpoint | ~100 |
| src/utils/backendClient.js | Backend API client | ~50 |
| **Total** | | **~1,150** |

**Compare with custom**: ~600 LOC but 50% more features

## Key Learnings

### When to Use LangGraph

✅ **Use LangGraph when**:
- Multi-step workflows (>3 steps)
- Conditional logic (if-then routing)
- Need state management across steps
- Want visual debugging
- Need error recovery/retry
- Building complex agent interactions

❌ **Don't use LangGraph when**:
- Simple single-step operations
- No conditional logic needed
- Performance is critical (graphs add overhead)
- Team unfamiliar with concept

### LangGraph vs Custom

**LangGraph pros**:
- Visual debugging
- Type-safe state
- Built-in patterns (retry, checkpointing)
- Easy to modify workflow
- Scales to complex graphs

**LangGraph cons**:
- Learning curve
- External dependency
- Slight performance overhead
- Requires LangSmith for full value

**Custom pros**:
- Full control
- No dependencies
- Maximum performance
- Team already knows patterns

**Custom cons**:
- More boilerplate
- Manual state management
- Hard to visualize
- Error handling everywhere

### Recommendation

For this project:
- ✅ **Use LangGraph** for intent routing and reconciliation (demonstrated value)
- ✅ **Use custom agents** for simple tool calling (Phase 1 agent is perfect)
- ✅ **Use both** - they complement each other!

---

**Phase 3 Status**: ✅ **COMPLETE**  
**Next Phase**: Phase 4 - Testing & Final Documentation

## Additional Resources

- [LangGraph Documentation](https://js.langchain.com/docs/langgraph)
- [State Machine Patterns](https://js.langchain.com/docs/langgraph/how-tos/state-machine)
- [LangSmith Tracing](https://docs.smith.langchain.com/)
- [Graph Examples](https://github.com/langchain-ai/langgraphjs/tree/main/examples)
