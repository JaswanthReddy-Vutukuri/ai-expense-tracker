# LangChain Agent Patterns - Production Architecture Guide

## Overview

This guide explains the **production-level LangChain architecture** used in `ai-langx/` including:
- Agent pattern flow
- Tool-calling mechanism
- LangGraph state management
- LangSmith observability

---

## 1. Core Agent Pattern: ReAct (Reason + Act)

### The Flow

```
User Input
    ↓
[1] REASON: LLM analyzes input with tools available
    └─ "The user wants to add an expense. I should call create_expense"
    ├─ Tool schemas provided to LLM
    ├─ System prompt gives instructions
    └─ LLM outputs decision + arguments
    ↓
[2] ACT: Executor calls the tool with LLM's arguments
    ├─ Tool validates inputs (Zod schema)
    ├─ Tool executes (API call, database, etc.)
    └─ Tool returns result/error
    ↓
[3] OBSERVE: Result added back to conversation
    ├─ Tool message inserted
    ├─ Loop continues if needed
    └─ LLM gets feedback
    ↓
REPEAT until LLM says "final answer"
    ↓
User receives response
```

### Code Location
- **Reason**: [ai-langx/src/graphs/intent-router.graph.js](ai-langx/src/graphs/intent-router.graph.js) - LLM intent classification
- **Act**: [ai-langx/src/agents/expense.agent.js](ai-langx/src/agents/expense.agent.js) - AgentExecutor loop
- **Observe**: LangChain's AgentExecutor handles this automatically

---

## 2. Deep Dive: The Expense Agent Pattern

### File Structure
```
ai-langx/src/agents/
├── expense.agent.js          ← Main file (this is the ReAct implementation)
└── (other agents would go here)

ai-langx/src/tools/
├── createExpense.tool.js     ← Tool definitions (StructuredTool)
├── listExpenses.tool.js
├── modifyExpense.tool.js
├── deleteExpense.tool.js
├── clearExpenses.tool.js
└── index.js                  ← Tool registry

ai-langx/src/config/
├── llm.config.js             ← LLM instance creation
└── langsmith.config.js       ← Tracing configuration

ai-langx/src/prompts/
└── system.prompt.js          ← Expense domain knowledge
```

### 2.1: Creating the Agent

**File**: `ai-langx/src/agents/expense.agent.js` - `createExpenseAgent()`

```javascript
export const createExpenseAgent = async (authToken, context = {}) => {
  // STEP 1: Create LLM
  const llm = createLLM({
    temperature: 0,  // Deterministic for tool-calling
    tags: getTraceTags('transactional', context.userId),
    metadata: getTraceMetadata(context.traceId, context.userId)
  });
  
  // STEP 2: Create tools
  const tools = createToolsWithContext(authToken, context);
  // [CreateExpenseTool, ListExpensesTool, ModifyExpenseTool, DeleteExpenseTool, ClearExpensesTool]
  
  // STEP 3: Create system prompt
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are an expense tracking assistant..."],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"]
  ]);
  
  // STEP 4: Create agent (the "Reason" step)
  // createOpenAIToolsAgent handles OpenAI's function-calling format
  const agent = await createOpenAIToolsAgent({
    llm,
    tools,
    prompt
  });
  
  // STEP 5: Create executor (the "Act" loop)
  // AgentExecutor handles Reason → Act → Observe loop
  const executor = new AgentExecutor({
    agent,
    tools,
    maxIterations: 5,                    // Safety limit
    returnIntermediateSteps: true,       // Observability
    handleParsingErrors: true            // Resilience
  });
  
  return executor;
};
```

### 2.2: Executing the Agent

**File**: `ai-langx/src/agents/expense.agent.js` - `executeExpenseAgent()`

```javascript
export const executeExpenseAgent = async (message, authToken, context = {}) => {
  const executor = await createExpenseAgent(authToken, context);
  
  // AgentExecutor.invoke() manages the entire loop
  const result = await Promise.race([
    executor.invoke({ input: message }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 60000))
  ]);
  
  // result.output = final answer
  // result.intermediateSteps = [{action, observation}, ...]
  return result.output;
};
```

### What AgentExecutor Does (The Loop)

```javascript
// Pseudo-code of what AgentExecutor does internally:

async invoke({ input }) {
  let iterations = 0;
  let messages = [SystemMessage, HumanMessage];
  const intermediateSteps = [];
  
  while (iterations < maxIterations) {
    iterations++;
    
    // REASON: Call LLM
    const response = await llm.invoke(messages);
    
    // Check if LLM wants to call a tool
    const toolCalls = response.additional_kwargs?.tool_calls;
    
    if (!toolCalls || toolCalls.length === 0) {
      // No tool calls = done reasoning
      return { output: response.content, intermediateSteps };
    }
    
    // ACT: Execute tools
    messages.push(response); // Add LLM response to history
    
    for (const toolCall of toolCalls) {
      const tool = tools.find(t => t.name === toolCall.name);
      const result = await tool.invoke(toolCall.arguments);
      messages.push(ToolMessage(result)); // Add result to history
      intermediateSteps.push({ action: toolCall, observation: result });
    }
    
    // Loop continues - LLM sees tool results and decides next step
  }
  
  return { output: "max iterations reached", intermediateSteps };
}
```

---

## 3. Tool Definition: StructuredTool Pattern

### File: `ai-langx/src/tools/createExpense.tool.js`

```javascript
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// STEP 1: Define schema with Zod
const CreateExpenseSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  category: z.string().min(1, "Category cannot be empty"),
  description: z.string().default(""),
  date: z.string().optional()
});

// STEP 2: Create StructuredTool
export class CreateExpenseTool extends StructuredTool {
  name = "create_expense";
  description = "Creates a new expense. Use when user wants to add an expense.";
  schema = CreateExpenseSchema;
  
  constructor(authToken, context) {
    super();
    this.authToken = authToken;
    this.context = context;
  }
  
  // STEP 3: Implement _call() method
  // Called automatically when LLM invokes this tool
  async _call(args) {
    // args are automatically validated by Zod schema
    console.log('[CreateExpenseTool] Executing:', args);
    
    // Call backend API
    const response = await axios.post(
      `${BACKEND_URL}/api/expenses`,
      { amount: args.amount, category_name: args.category, ... },
      { headers: { Authorization: `Bearer ${this.authToken}` } }
    );
    
    return `✅ Created expense: ₹${args.amount} for ${args.category}`;
  }
}
```

### How Tools Get Used

```
User: "Add ₹200 for lunch"
  ↓
LangChain (via createOpenAIToolsAgent) converts Zod schema → OpenAI function schema:
{
  "type": "function",
  "function": {
    "name": "create_expense",
    "description": "Creates a new expense...",
    "parameters": {
      "type": "object",
      "properties": {
        "amount": { "type": "number" },
        "category": { "type": "string" },
        ...
      },
      "required": ["amount", "category"]
    }
  }
}
  ↓
OpenAI LLM receives schema + example
LLM thinks: "User wants to add expense, I should call create_expense"
LLM outputs: { "function": "create_expense", "arguments": { "amount": 200, "category": "lunch" } }
  ↓
AgentExecutor parses LLM response, finds CreateExpenseTool
Executor calls: CreateExpenseTool.invoke({ amount: 200, category: "lunch" })
  ↓
Zod validates: ✓ amount is positive number, ✓ category is string
Executes: CreateExpenseTool._call(args)
  ↓
Returns: "✅ Created expense: ₹200 for lunch"
  ↓
AgentExecutor adds result back to messages
Loops: LLM sees tool result, decides if more tools needed or done
```

---

## 4. Intent Router: Statement vs Conditional

### File: `ai-langx/src/graphs/intent-router.graph.js`

While the expense agent handles **tool-calling**, the intent router handles **routing**.

```javascript
// Step 1: LLM classifies intent
async classifyIntent(state) {
  const llm = createLLM();
  
  const response = await llm.invoke([
    SystemMessage("Classify this message as: expense_operation, rag_question, ..."),
    HumanMessage(state.userMessage)
  ]);
  
  return {
    intent: "expense_operation",        // Parsed from response
    confidence: 0.95,
    entities: { amount: 200, category: "lunch" }
  };
}

// Step 2: StateGraph routes based on intent
graph.addConditionalEdges(
  "classifyIntent",
  routeByIntent  // Function that looks at state.intent
);

function routeByIntent(state) {
  if (state.intent === "expense_operation") return "handleExpenseOperation";
  if (state.intent === "rag_question") return "handleRAGQuestion";
  // ... etc
}
```

---

## 5. LangSmith Observability

### Automatic Tracing

Every agent call is traced when you provide tags/metadata:

```javascript
const llm = createLLM({
  tags: getTraceTags('transactional', userId),  // [user-3, expense-operation]
  metadata: getTraceMetadata(traceId, userId)   // { traceId, userId, timestamp }
});
```

### What Gets Traced

1. **LLM Calls**: Every invoke() to OpenAI
   - Input tokens, output tokens
   - Temperature, model
   - Latency

2. **Tool Calls**: Every tool execution
   - Tool name, arguments
   - Execution time
   - Success/failure

3. **Agent Loop**: Full ReAct cycle
   - Reasoning steps
   - Observation/feedback loop
   - Iterations count

### Viewing in LangSmith Dashboard

```
https://smith.langchain.com/
├── Projects
│   └── ai-expense-tracker
│       └── Traces
│           ├── agent_run_1
│           │   ├── LLM: classifyIntent (input: "Add ₹200...")
│           │   ├── LLM: expense_agent (input: "User wants to add...")
│           │   │   ├── Tool: create_expense (args: {amount: 200, category: "lunch"})
│           │   │   │   └─ Backend: POST /api/expenses
│           │   │   │       └─ Result: ✅ Created
│           │   │   └── (LLM generates final response)
│           │   └── Total: 1.2s
│           └── Agent metrics
```

---

## 6. State Flow in StateGraph vs AgentExecutor

### StateGraph (Intent Router)
Used for **routing and state orchestration**

```
StateGraph has explicit channels:
├─ userMessage (string) - Input
├─ userId (number) - Context
├─ intent (string) - Classification result
├─ confidence (number) - How sure?
├─ entities (object) - Extracted data
├─ result (string) - Final output
└─ error (string) - Error if any

Each node can read/write to channels
State flows through nodes
Conditional edges route based on state
```

### AgentExecutor (Expense Agent)
Used for **tool-calling loops**

```
AgentExecutor manages internally:
├─ messages (array) - Conversation history
│   ├─ SystemMessage - Instructions
│   ├─ HumanMessage - User input
│   ├─ AIMessage - LLM reasoning
│   └─ ToolMessage - Tool results
├─ tools (array) - Available tools
└─ intermediateSteps - [{action, observation}, ...]

No explicit state channels - uses message history
Loop continues until LLM says "stop"
```

---

## 7. Comparison: Custom vs LangChain

| Aspect | Custom (ai/) | LangChain (ai-langx) |
|--------|------|----------|
| **Loop Management** | Manual `while` loop | AgentExecutor built-in |
| **Tool Parsing** | Manual regex/JSON | Automatic from LLM response |
| **Tool Execution** | Manual function call | StructuredTool._call() |
| **Validation** | Manual JSON schema | Zod automatic validation |
| **Message Management** | Manual array building | LangChain BaseMessage classes |
| **Error Handling** | Custom try/catch | Built-in + handleParsingErrors |
| **Tracing** | Manual logging | LangSmith automatic |
| **Lines of Code** | ~200 | ~80 |
| **Control Flow** | Direct callbacks | Framework abstraction |
| **Extensibility** | Replace everything | Add callbacks, use hooks |

---

## 8. Production Patterns You Should Know

### Pattern 1: State Injection
```javascript
// Each request gets fresh agent with context
const agent = await createExpenseAgent(authToken, { userId, traceId });

// This enables:
// - User isolation (authToken)
// - Request tracing (traceId)
// - Cost tracking (userId)
// - A/B testing (see tags in LangSmith)
```

### Pattern 2: Stateless Execution
```javascript
// Agent doesn't depend on global state
// Perfect for serverless (AWS Lambda, Vercel)
// Can scale horizontally

async function chatHandler(req, res) {
  const agent = await createExpenseAgent(req.token, req.context);
  const result = await agent.invoke({ input: req.body.message });
  res.json({ reply: result.output });
}
```

### Pattern 3: Timeout Protection
```javascript
// Prevent LLM hangs from blocking server
const result = await Promise.race([
  executor.invoke({ input: message }),
  timeoutPromise(60000)  // Fail fast after 60s
]);
```

### Pattern 4: Error Classification
```javascript
// Different errors need different user messages
if (error.message.includes('timeout')) {
  return "⚠️ Request timed out. Try a simpler request.";
}
if (error.message.includes('unauthorized')) {
  return "⚠️ Authentication failed. Log in again.";
}
```

---

## 9. Full Request Flow

```
POST /ai/chat { message: "Add ₹200 for lunch" }
  ↓
[Chat Route] src/routes/chat.js
  ├─ Auth middleware validates JWT
  ├─ Extracts: userId, traceId, message
  └─ Calls: executeIntentRouter()
    ↓
[Intent Router] src/graphs/intent-router.graph.js
  ├─ StateGraph execution starts
  ├─ Node: classifyIntent()
  │   └─ LLM input: "Classify: Add ₹200 for lunch"
  │   └─ LLM output: { intent: "expense_operation", confidence: 0.95 }
  │   └─ State updated: intent, confidence, entities
  ├─ Conditional edge: routeByIntent()
  │   └─ Sees state.intent = "expense_operation"
  │   └─ Routes to: handleExpenseOperation node
  ├─ Node: handleExpenseOperation()
  │   └─ Calls: executeExpenseAgent()
  │     ↓
[Expense Agent] src/agents/expense.agent.js
  │     ├─ Creates agent:
  │     │   ├─ LLM (with tools schema)
  │     │   ├─ Tools (CreateExpenseTool, etc.)
  │     │   ├─ Prompt template
  │     │   └─ AgentExecutor
  │     ├─ Executor loop iteration 1:
  │     │   ├─ [REASON] LLM sees: "Add ₹200 for lunch"
  │     │   │              LLM decides: call create_expense tool
  │     │   │              LLM outputs: {function: "create_expense", arguments: {...}}
  │     │   ├─ [ACT] Tool execution:
  │     │   │         CreateExpenseTool.invoke({amount: 200, category: "lunch"})
  │     │   │         └─ Zod validates arguments
  │     │   │         └─ API call: POST /api/expenses (via authToken)
  │     │   │         └─ Backend records expense in database
  │     │   │         └─ Returns: "✅ Created expense: ₹200 for lunch"
  │     │   ├─ [OBSERVE] Message added:
  │     │   │           ToolMessage(name="create_expense", content="✅ Created...")
  │     │   ├─ Loop continues:
  │     │   │   LLM sees tool result
  │     │   │   LLM decides: no more tools needed
  │     │   │   LLM outputs: "I've successfully added..."
  │     │   ├─ Returns: result.output = "I've successfully added..."
  │     │   └─ Intermediate steps logged for LangSmith
  │     └─ Result: "I've successfully added ₹200 for lunch"
  ├─ Final edge: Send to output
  └─ Returns final state
    ↓
[Chat Route] Returns HTTP response
  └─ { reply: "I've successfully added ₹200 for lunch" }
    ↓
User sees: "✅ I've successfully added ₹200 for lunch"
Database has: New expense record
LangSmith shows: Full trace of all LLM calls and tool executions
```

---

## 10. Learning Resources in This Codebase

### To Understand Agent Pattern
- Compare `ai/src/llm/agent.js` (manual loop) vs `ai-langx/src/agents/expense.agent.js` (LangChain)
- Watch how each tool-calling step works

### To Understand State Management
- Compare `ai-langx/src/graphs/intent-router.graph.js` (StateGraph) vs agent execution (AgentExecutor)
- See how state flows through nodes

### To Understand Observability
- Check `ai-langx/src/config/langsmith.config.js` for tag/metadata injection
- Look at logs from server console
- Visit LangSmith dashboard to see traces

### To Understand Tool Integration
- See `ai-langx/src/tools/index.js` for tool registry
- See `ai-langx/src/tools/createExpense.tool.js` for StructuredTool pattern
- Note how Zod schemas become OpenAI function schemas

---

## 11. Production Checklist

When building LangChain agents for production:

- [ ] Input validation (guard against malformed input)
- [ ] Timeout protection (Promise.race with timeout)
- [ ] Error classification (different errors → different messages)
- [ ] Context injection (userId, traceId for tracing)
- [ ] Tool schemas (Zod validation)
- [ ] System prompt (clear instructions for tool usage)
- [ ] Max iterations limit (prevent infinite loops)
- [ ] Intermediate steps logging (for debugging)
- [ ] Rate limiting (on tool execution if needed)
- [ ] Cost tracking (monitor token usage)
- [ ] LangSmith integration (production observability)
- [ ] Auth/security (validate tokens before tool execution)
- [ ] Fallback behavior (what if LLM can't decide?)
- [ ] Graceful degradation (serve base response if agent fails)

---

## 12. Next Steps

1. **Run the system**: Start both `ai/` and `ai-langx/` servers
2. **Test agent**: Send message to `/ai/chat` endpoint
3. **Monitor traces**: Check console logs and LangSmith dashboard
4. **Compare**: Look at custom agent vs LangChain agent outputs
5. **Extend**: Add new tools using StructuredTool pattern
6. **Optimize**: Check LangSmith for token usage, latency

---

**This is production-level LangChain architecture.** Everything here scales to thousands of requests and hundreds of tools.
