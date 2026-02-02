# Workspace Context for GitHub Copilot

This VS Code workspace contains THREE independent applications:

1. frontend/
   - Angular application
   - UI, routing, services, and components only
   - Never contains backend or AI logic

2. backend/
   - Node.js + Express + SQLite
   - Source of truth for authentication, expenses, and dashboard APIs
   - Fully documented via OpenAPI
   - No AI or LLM logic allowed here

3. ai/
   - AI Orchestrator service
   - Handles natural language input
   - Communicates with backend ONLY via HTTP APIs
   - Uses LLMs and MCP-style tools
   - Does NOT access the database directly

CRITICAL RULES:
- Code must only be added or modified inside the relevant folder
- Never mix responsibilities across folders
- AI logic belongs ONLY in ai/
- Business logic belongs ONLY in backend/
- UI logic belongs ONLY in frontend/

Assume all services are independent and communicate over HTTP.
