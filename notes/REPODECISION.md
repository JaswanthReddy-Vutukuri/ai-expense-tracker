# 📁 REPOSITORY STRUCTURE DECISION

Great question — this is an *architecture-level* decision, and getting it right now will save you a lot of pain later.
Let's be crisp, practical, and realistic.

---

## The short answer (TL;DR)

👉 **Keep the AI Orchestrator as a separate service (separate repo)**
👉 Treat it as a **first-class backend**, not a feature
👉 Frontend talks to **AI Orchestrator**, AI Orchestrator talks to **Backend API**

This gives you **clean boundaries, scalability, and freedom**.

Now let’s unpack *why*, *how*, and *what it looks like in practice*.

---

## 1️⃣ What NOT to do (important)

### ❌ Don’t put AI inside frontend repo

* Leaks secrets (LLM keys)
* Hard to secure
* Not scalable
* Impossible to evolve

### ❌ Don’t cram AI into existing backend

* Mixes business logic with AI reasoning
* Makes backend fragile
* Hard to disable / swap models
* Slows down core APIs

AI is **not CRUD**. It deserves its own boundary.

---

## 2️⃣ Recommended Repo Structure

You will end up with **3 repos** (clean and future-proof):

```
expense-tracker-frontend   (Angular)
expense-tracker-backend    (Node + SQLite)
expense-tracker-ai         (AI Orchestrator)
```

This is the **sweet spot** between simplicity and scalability.

---

## 3️⃣ Responsibility Boundaries (Very Important)

### Frontend (Angular)

* UI only
* Auth flows
* Expense CRUD UI
* AI chat UI
* Never talks to DB
* Never talks to LLM

### Backend (Node + SQLite)

* Source of truth
* Auth, expenses, dashboard
* OpenAPI-defined APIs
* No AI logic

### AI Orchestrator (New)

* Natural language understanding
* LLM calls
* MCP tool execution
* Translates text → API calls
* Stateless per request

Each layer has **one job**.

---

## 4️⃣ Communication Flow (Flawless & Scalable)

### Normal UI flow

```
Frontend → Backend API
```

### AI Chat flow

```
Frontend → AI Orchestrator → Backend API
```

Backend never knows AI exists.
Frontend never knows backend internals.

---

## 5️⃣ Authentication Strategy (This is key)

### Use **JWT pass-through**

**Flow:**

1. User logs in → gets JWT from backend

2. Frontend stores JWT

3. Frontend sends JWT to:

   * Backend API (normal flows)
   * AI Orchestrator (AI chat)

4. AI Orchestrator:

   * Verifies JWT OR
   * Forwards JWT to backend APIs

👉 **Single source of auth truth = backend**

### Why this works

* No duplicate auth systems
* No token translation
* Simple revocation
* Scales cleanly

---

## 6️⃣ API Contracts Between Services

### AI Orchestrator API (minimal)

```
POST /ai/chat
Authorization: Bearer <JWT>

{
  "message": "Spent 500 on groceries yesterday"
}
```

Response:

```
{
  "reply": "Added a grocery expense of ₹500 for yesterday."
}
```

That’s it. Keep it boring.

---

## 7️⃣ Backend API Consumption (from AI Orchestrator)

The AI Orchestrator:

* Uses backend’s **OpenAPI spec**
* Wraps each endpoint as an MCP tool
* Calls backend over HTTP
* Handles retries, mapping, normalization

This allows:

* Backend upgrades without AI changes
* Tool regeneration from OpenAPI later

---

## 8️⃣ Deployment Model (Scalable & Clean)

### Option A (Recommended for now – Vercel-friendly)

* Frontend → Vercel
* Backend → Vercel / Node server
* AI Orchestrator → Vercel serverless or Node service

Pros:

* Easy setup
* Independent scaling
* Independent deploys

### Option B (Later – High traffic)

* AI Orchestrator on separate compute (longer timeouts)
* Backend stays lightweight

---

## 9️⃣ Environment Configuration

Each repo has its own `.env`

### Frontend

```
API_BASE_URL=https://backend.example.com
AI_API_URL=https://ai.example.com
```

### Backend

```
JWT_SECRET=...
DB_PATH=...
```

### AI Orchestrator

```
LLM_API_KEY=...
BACKEND_API_URL=https://backend.example.com
```

No secrets leak across boundaries.

---

## 10️⃣ Why This Scales (Technically & Organizationally)

### Technical scaling

* AI latency doesn’t affect CRUD APIs
* Can rate-limit AI separately
* Can swap LLMs easily
* Can add caching

### Team scaling

* Frontend devs don’t touch AI
* Backend devs don’t worry about prompts
* AI logic evolves independently

---

## 11️⃣ Future-Proofing (You’ll thank yourself later)

With this setup, later you can add:

* Budget insights
* Spending predictions
* Background jobs
* Vector search
* Multiple AI assistants

Without refactoring core systems.

---

## 12️⃣ Decision Summary (Clear & Final)

✔ Keep **3 separate repos**
✔ AI Orchestrator is its own service
✔ JWT pass-through auth
✔ MCP tools map to backend APIs
✔ Frontend talks to AI only via `/ai/chat`

This is **clean, scalable, and professional-grade**.

---

If you want, next I can:

* 🔹 Draw a **sequence diagram**
* 🔹 Define **exact folder structure for AI repo**
* 🔹 Show **how to share OpenAPI between backend & AI**
* 🔹 Propose **Vercel deployment topology**
* 🔹 Help you decide **Node vs Python for AI**

Just tell me what you want next 👌
