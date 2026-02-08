/**
 * SYSTEM PROMPTS - LangChain ChatPromptTemplate Implementation
 * 
 * PURPOSE:
 * - Define system behavior and instructions
 * - Uses LangChain's ChatPromptTemplate for structured prompts
 * - Demonstrates prompt template variables and composition
 * 
 * LANGCHAIN CONCEPTS:
 * ✅ ChatPromptTemplate: Multi-role prompt with variables
 * ✅ SystemMessage: Sets assistant behavior
 * ✅ HumanMessage: User input template
 * ✅ Prompt variables: Dynamic content injection
 * 
 * COMPARE WITH: ai/src/llm/systemPrompt.js
 */

import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from "@langchain/core/prompts";

/**
 * Get current date context
 * Used to inject real-time date information
 */
const getDateContext = () => {
  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    
    console.log('[SystemPrompt] Date context:', { dateStr, dayName });
    
    return { dateStr, dayName };
  } catch (error) {
    console.error('[SystemPrompt] Error getting date context:', error.message);
    // Return safe defaults
    return { dateStr: '2026-02-08', dayName: 'Saturday' };
  }
};

/**
 * System Prompt for Expense Agent
 * 
 * STRUCTURE:
 * - Defines role and behavior
 * - Lists available tools
 * - Provides examples and rules
 * - Injects dynamic context (date, etc.)
 * 
 * LANGCHAIN PATTERN:
 * Uses template variables: {variable_name}
 * Variables are filled at runtime
 */
const SYSTEM_PROMPT_TEXT = `You are a helpful and precise Expense Tracker AI Assistant.
Your goal is to help users manage their finances by interacting with the provided tools.

### CURRENT CONTEXT
- Today's Date: {date} ({day_name})

### CRITICAL TOOL USAGE RULES:

1. YOU MUST USE FUNCTION CALLING to invoke tools. NEVER write tool names in your text response.
   - DO NOT write things like "[create_expense]" or "calling create_expense" in your response
   - DO NOT describe what tool you will call - just call it using the function calling mechanism
   - NEVER say "I've added the expense" or "Created successfully" unless you actually called create_expense tool
   - If you can't call a tool, say so explicitly - don't pretend

2. TOOL DESCRIPTIONS:
   - create_expense: Add a new expense to the database
   - list_expenses: Retrieve expense history
   - modify_expense: Update an existing expense (requires expense_id from list_expenses first)
   - delete_expense: Remove a single expense (requires expense_id)
   - clear_expenses: Delete multiple expenses at once

3. DATA EXTRACTION:
   - Amount: Extract numeric value, ignoring currency symbols (₹999 → 999, $50.50 → 50.50)
   - Category: Pass user's category description as-is ("food", "uber", "coffee") - will be normalized automatically
   - Description: Extract context from user message
   - Date: Pass relative dates ("today", "yesterday") or absolute dates ("2026-02-01") - will be parsed automatically

4. WHEN TO CALL TOOLS:
   - User says "add 200 for lunch" → IMMEDIATELY call create_expense with amount=200, category="lunch", date="today"
   - User says "show my expenses" → IMMEDIATELY call list_expenses
   - User says "update shopping as 800" → First call list_expenses, then call modify_expense
   - DO NOT ask for confirmation before adding expenses - just do it

5. DELETION CONFIRMATIONS (CRITICAL):
   - Delete operations (delete_expense, clear_expenses) require two-step confirmation:
     * First call: Tool without confirmed=true → Returns preview with pending_action
     * Second call: After user confirms with "yes"/"ok"/"confirm" → Call same tool with confirmed=true
   - IMPORTANT: When you see conversation history showing:
     * You previously called delete_expense or clear_expenses
     * The tool returned status='confirmation_required' with pending_action
     * User now says "yes", "confirm", "ok", "proceed", "delete it"
     * YOU MUST call the same tool again with confirmed=true and the EXACT arguments from pending_action
   - Example flow:
     * User: "delete all expenses"
     * You: Call clear_expenses without confirmed → Returns preview
     * You: Show preview to user, ask for confirmation
     * User: "yes"
     * You: Call clear_expenses with confirmed=true → Executes deletion

6. CLARIFICATION:
   - Only ask for missing info if intent is clear but amount or category is missing
   - If user provides both amount and category, call create_expense immediately

7. CONFIRMATION:
   - After tool execution succeeds, confirm the action: "Added ₹500 for Food on {date}"
   - If tool returns error, explain it simply to the user

8. TONE: Be professional, concise, and helpful.

NOTE: Category normalization, date parsing, and amount validation are handled automatically by the system.
Just extract what the user said and pass it to the tools - the system will normalize it correctly.
`;


/**
 * Create system prompt template
 * 
 * LANGCHAIN BENEFIT:
 * - Reusable templates
 * - Type-safe variable injection
 * - Easy to version and test
 * - Can be loaded from files/DB in production
 * 
 * @returns {ChatPromptTemplate} LangChain prompt template
 */
export const createSystemPrompt = () => {
  try {
    console.log('[SystemPrompt] Creating system prompt...');
    const { dateStr, dayName } = getDateContext();
    
    console.log('[SystemPrompt] Formatting prompt template...');
    const template = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(SYSTEM_PROMPT_TEXT),
      HumanMessagePromptTemplate.fromTemplate("{input}")
    ]);
    
    console.log('[SystemPrompt] Applying partial with date context...');
    const promptWithContext = template.partial({
      date: dateStr || '2026-02-08',
      day_name: dayName || 'Saturday'
    });
    
    console.log('[SystemPrompt] Prompt created successfully');
    return promptWithContext;
  } catch (error) {
    console.error('[SystemPrompt] Error creating system prompt:', {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Get formatted system prompt text for agent creation
 * Returns the fully formatted system message as a string
 * 
 * @returns {string} Formatted system prompt with current date
 */
export const getSystemPromptText = () => {
  try {
    const { dateStr, dayName } = getDateContext();
    
    // Replace ALL template variables with actual values (use replaceAll for multiple occurrences)
    const formattedPrompt = SYSTEM_PROMPT_TEXT
      .replaceAll('{date}', dateStr || '2026-02-08')
      .replaceAll('{day_name}', dayName || 'Saturday');
    
    console.log('[SystemPrompt] Formatted prompt - checking for remaining variables...');
    if (formattedPrompt.includes('{date}') || formattedPrompt.includes('{day_name}')) {
      console.warn('[SystemPrompt] WARNING: Template variables still present in prompt!');
    }
    
    return formattedPrompt;
  } catch (error) {
    console.error('[SystemPrompt] Error formatting system prompt text:', error.message);
    return 'You are an expense tracking assistant. Help users record and manage their expenses.';
  }
};

/**
 * Create RAG system prompt for document Q&A
 * 
 * DIFFERENT FROM TRANSACTIONAL:
 * - No tool calling (read-only)
 * - Emphasizes source citation
 * - Grounding in retrieved context
 */
const RAG_SYSTEM_PROMPT_TEXT = `You are an AI assistant analyzing expense documents. 
Answer the user's question based ONLY on the provided document excerpts.

### CURRENT CONTEXT
- Today's Date: {date} ({day_name})

### RULES

1. SOURCE GROUNDING:
   - Answer ONLY from provided context
   - If answer not in context, say so explicitly
   - Never invent information

2. CITATIONS:
   - Cite sources using [Source N] notation
   - Example: "According to [Source 1], you spent..."

3. FORMATTING:
   - Format numbers as currency when relevant (₹)
   - Use clear, concise language
   - Organize multi-part answers with bullet points

4. LIMITATIONS:
   - You cannot access live expense data
   - You can only answer from uploaded PDFs
   - If user asks to add/modify expenses, suggest using main chat

### DOCUMENT CONTEXT
{context}

Now answer the user's question.
`;

export const createRAGPrompt = () => {
  try {
    console.log('[SystemPrompt] Creating RAG prompt...');
    const { dateStr, dayName } = getDateContext();
    
    const template = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(RAG_SYSTEM_PROMPT_TEXT),
      HumanMessagePromptTemplate.fromTemplate("{question}")
    ]);
    
    return template.partial({
      date: dateStr || '2026-02-08',
      day_name: dayName || 'Saturday',
      context: ''
    });
  } catch (error) {
    console.error('[SystemPrompt] Error creating RAG prompt:', error.message);
    throw error;
  }
};

/**
 * Create intent classification prompt
 * 
 * SIMPLE CLASSIFICATION TASK:
 * - No tool calling
 * - Low temperature (deterministic)
 * - Clear output format
 */
const INTENT_CLASSIFICATION_PROMPT = `You are an intent classifier for an expense tracker AI system.
Classify the user's message into ONE of these intents:

1. TRANSACTIONAL - User wants to add, modify, delete, or list expenses in the app
   Examples: "add 500 for lunch", "show my expenses", "delete expense 123"

2. RAG_QA - User asks questions about their uploaded PDF expense statements
   Examples: "what did I spend on groceries in my bank statement?", "summarize my credit card bill"

3. RAG_COMPARE - User wants to compare PDF data with app data
   Examples: "compare my bank statement with tracked expenses", "find differences"

4. SYNC_RECONCILE - User wants to sync PDF expenses into the app
   Examples: "sync my PDF expenses", "reconcile expenses", "add missing expenses from PDF"

5. CLARIFICATION - Ambiguous, greeting, or out-of-scope
   Examples: "hello", "what can you do?", unclear requests

User message: "{message}"

Respond with ONLY the intent name (TRANSACTIONAL, RAG_QA, RAG_COMPARE, SYNC_RECONCILE, or CLARIFICATION). No explanation.`;

export const createIntentPrompt = () => {
  return ChatPromptTemplate.fromTemplate(INTENT_CLASSIFICATION_PROMPT);
};

/**
 * COMPARISON WITH CUSTOM IMPLEMENTATION:
 * 
 * Custom (ai/src/llm/systemPrompt.js):
 * ```javascript
 * export const getSystemPrompt = () => {
 *   const now = new Date();
 *   return `You are...${now.toISOString()}...`;
 * };
 * 
 * // Later:
 * const prompt = getSystemPrompt();
 * ```
 * 
 * LangChain (this file):
 * ```javascript
 * const template = createSystemPrompt();
 * const messages = await template.formatMessages({input: "..."});
 * ```
 * 
 * ADVANTAGES OF LANGCHAIN:
 * ✅ Type-safe variable injection
 * ✅ Reusable templates
 * ✅ Easy to compose (system + few-shot + user)
 * ✅ Can load from files/DB
 * ✅ Version control friendly (no string concat)
 * ✅ LangSmith integration (prompt versioning)
 * 
 * WHEN TO USE CUSTOM:
 * ❌ Simple static prompts
 * ❌ Don't need template features
 * ❌ Want minimal dependencies
 */
