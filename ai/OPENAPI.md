# AI Orchestrator API Contract

Base path: /ai

This service exposes a minimal, stable API for AI interactions.

## POST /ai/chat

Purpose:
- Accept natural language input from the frontend
- Interpret user intent using an LLM
- Execute backend actions via tools
- Return a natural language response

### Request
Headers:
- Authorization: Bearer <JWT>

Body:
{
  "message": "Spent 450 on food yesterday"
}

### Response
200 OK
{
  "reply": "I’ve added a food expense of ₹450 for yesterday."
}

### Error Responses
- 400: Invalid input
- 401: Unauthorized
- 500: AI processing error

Rules:
- Stateless per request
- No streaming in v1
- No multi-agent logic
