/**
 * CLARIFICATION HANDLER
 * 
 * Purpose:
 * - Handles ambiguous, greeting, or out-of-scope requests
 * - Provides helpful guidance to users
 * - Explains system capabilities
 * 
 * Why it exists:
 * - Improves user experience with unclear inputs
 * - Provides system documentation dynamically
 * - Catches edge cases gracefully
 * 
 * Architecture fit:
 * - Called by intent router when intent = CLARIFICATION
 * - Returns static or template-based responses
 * - Can optionally use LLM for natural responses
 */

/**
 * Generates helpful clarification or guidance
 * @param {string} userMessage - User's unclear or greeting message
 * @returns {Promise<string>} Helpful response
 */
export const handleClarification = async (userMessage) => {
  console.log('[Clarification Handler] Providing guidance');
  
  const lower = userMessage.toLowerCase();
  
  // Greetings
  if (lower.match(/^(hi|hello|hey)\b/)) {
    return `Hello! I'm your Expense Tracker AI assistant. I can help you with:

1️⃣ **Expense Operations**
   - "Add ₹500 for lunch today"
   - "Show my expenses this month"
   - "Delete expense 123"

2️⃣ **Document Analysis** (Upload PDF statements first)
   - "What did I spend on groceries according to my statement?"
   - "Summarize my credit card bill"

3️⃣ **Data Comparison**
   - "Compare my bank statement with tracked expenses"
   - "Find differences between PDF and my records"

What would you like to do?`;
  }
  
  // Help requests
  if (lower.includes('help') || lower.includes('what can you')) {
    return `I'm an AI-powered expense tracker with these capabilities:

**💰 Expense Management**
Add, list, modify, or delete expenses using natural language.

**📄 Document Intelligence (RAG)**
Upload PDF expense statements and ask questions about them.

**🔍 Smart Comparison**
Compare your PDF statements with your tracked expenses to find discrepancies.

**Examples:**
- "Add 1500 for groceries today"
- "Show all my transport expenses this week"
- "What's the total in my uploaded bank statement?"
- "Compare my credit card bill with my app expenses"

Try any of these!`;
  }
  
  // Unclear requests
  return `I didn't quite understand that. Could you please clarify?

I can help you with:
- **Adding/viewing expenses**: "Add 200 for coffee" or "Show today's expenses"
- **Document questions**: "What's in my PDF statement?" (after uploading)
- **Comparisons**: "Compare my statement with my tracked expenses"

What would you like to do?`;
};
