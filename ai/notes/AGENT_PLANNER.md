# 🤖 AI AGENT PLANNER - ARCHITECTURAL DECISION
Short answer: **yes, this is a good idea — *if* you do it the right way**.
Long answer below, because this is *exactly* where many systems either scale cleanly… or collapse under their own “agent magic”.

You’re basically proposing a **router / planner layer** that decides *which capability pipeline to invoke*:

* **Transactional MCP flow** (add/list/update/delete)
* **RAG / document reasoning flow**

This is **very close to how Perplexity, ChatGPT, and enterprise copilots actually work** — but with some important constraints.

Let’s break it down properly.

---

# 1️⃣ Is Adding an Agent a Good Idea?

### ✅ Yes — *as a router*, not as a thinker

The mistake most people make:

> “Let the agent think and decide everything”

The correct approach:

> “Let the agent classify + route, not execute business logic”

Your idea is solid **if the agent’s responsibility is narrow**.

---

# 2️⃣ Correct Mental Model

Think of your system like this:

```
User Message
   ↓
Intent Router (Lightweight Agent)
   ↓
┌───────────────┬─────────────────────┐
│ Transactional │ RAG / Document Flow │
│ (MCP Tools)   │                     │
└───────────────┴─────────────────────┘
```

The **router does not**:

* Call APIs
* Do RAG
* Execute tools
* Maintain memory

It only answers:

> “Which pipeline should handle this?”

---

# 3️⃣ How Perplexity & Similar Systems Actually Do It

Perplexity-style systems **do NOT** use a single monolithic agent.

They do:

### Step 1: **Query Classification**

* Search query?
* Factual?
* Transactional?
* Conversational?

### Step 2: **Pipeline Selection**

* Search + RAG
* Tool call
* Cached answer
* Hybrid

### Step 3: **Specialized Execution**

* Each pipeline optimized for its job

⚠️ Key insight:

> **The “agent” is just a planner + router.**

---

# 4️⃣ Your Proposed Flows (Refined)

### Flow A — Transactional (Existing)

For:

* Add expense
* Update expense
* Delete expense
* List expenses
* Dashboard summary

Pipeline:

```
User → LLM → MCP Tool → Backend → Response
```

Fast, cheap, deterministic.

---

### Flow B — RAG / Document Intelligence

For:

* “Compare PDF with app data”
* “How much according to uploaded document”
* “Find mismatches”
* “Explain differences”

Pipeline:

```
User → Router → RAG Retriever → Augmentation → LLM → Response
```

Slower, more expensive, but powerful.

---

# 5️⃣ How the Router Agent Should Work (IMPORTANT)

### What the Router Agent Does

Input:

```json
{
  "message": "Compare my PDF expenses with app data"
}
```

Output (structured):

```json
{
  "route": "RAG_COMPARE",
  "confidence": 0.91
}
```

Possible routes:

* `TRANSACTIONAL`
* `RAG_QA`
* `RAG_COMPARE`
* `CLARIFICATION`

That’s it.

---

### What It Must NOT Do

❌ No API calls
❌ No RAG execution
❌ No DB access
❌ No chaining tools

This keeps it:

* Fast
* Cheap
* Testable
* Predictable

---

# 6️⃣ Pros of This Architecture

### ✅ 1. Clean Separation of Concerns

* Each pipeline optimized independently
* No “if/else hell” inside prompts

---

### ✅ 2. Scalability

* Transactional queries remain fast
* RAG queries scale horizontally
* Easy to cache classification results

---

### ✅ 3. Cost Control

* Most queries are cheap
* RAG invoked only when necessary
* Embeddings not computed for every message

---

### ✅ 4. Explainability (Huge for demos)

You can say:

> “The system first classifies your request, then routes it.”

This impresses stakeholders.

---

### ✅ 5. Future Expansion

Later you can add:

* Forecasting flow
* Anomaly detection
* Fraud detection
* Tax optimization

Without touching existing flows.

---

# 7️⃣ Cons & Risks (Very Important)

### ⚠️ 1. Over-Agentification Risk

If you let the agent:

* Plan steps
* Call tools
* Re-route mid-flight

👉 You’ll get:

* Latency spikes
* Unpredictable behavior
* Debugging nightmares

**Mitigation:**
Keep the router dumb and deterministic.

---

### ⚠️ 2. Misclassification Edge Cases

Example:

> “Add expenses from this PDF”

This touches **both** flows.

**Mitigation:**

* Router returns `HYBRID`
* Ask clarification
* Or force user choice

---

### ⚠️ 3. Latency

Router adds ~1 extra LLM call.

**Mitigation:**

* Use small model
* Cache classification
* Fast prompt (<50 tokens)

---

# 8️⃣ Recommended Router Design (Best Practice)

### Option A — Rule-first, LLM-second (Best)

```txt
If message contains:
- upload, pdf, document → RAG
- add, delete, update → Transactional
Else → LLM classifier
```

This reduces LLM calls by ~60%.

---

### Option B — Pure LLM Classifier

Simpler, but more expensive.

---

# 9️⃣ Concrete Architecture (Final Recommendation)

```
/ai/chat
   ↓
Router (cheap LLM or rules)
   ↓
┌────────────────────────────┐
│ If TRANSACTIONAL           │
│   → Existing MCP Flow      │
│                            │
│ If RAG_QA or RAG_COMPARE   │
│   → RAG Pipeline           │
└────────────────────────────┘
```

Your existing system **does not get replaced** — it gets **augmented**.

---

# 🔑 Verdict

**Your idea is GOOD.**
But only if:

✔ Agent is a **router**, not a thinker
✔ Execution pipelines are separate
✔ RAG is opt-in, not default
✔ Tool calls remain deterministic

This is **very close to how Perplexity actually works**, minus their search infra.

---

If you want next, I can:

* Design the **router prompt**
* Show **confidence-based routing**
* Give a **Workik prompt** to implement it
* Help you build a **demo flow diagram**

Just tell me 👌
