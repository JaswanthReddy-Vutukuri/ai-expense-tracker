import OpenAI from 'openai';
import { getSystemPrompt } from './systemPrompt.js';
import { getToolDefinitions, executeTool } from '../mcp/tools/index.js';

// Configure OpenAI client with environment-based settings
// If LLM_BASE_URL is not set, uses default OpenAI endpoint
const openaiConfig = {
  apiKey: process.env.LLM_API_KEY
};

// Add custom baseURL only if configured
if (process.env.LLM_BASE_URL) {
  openaiConfig.baseURL = process.env.LLM_BASE_URL;
  console.log(`[Agent] Using custom LLM endpoint: ${process.env.LLM_BASE_URL}`);
}

const openai = new OpenAI(openaiConfig);

// Get model from environment or use default
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

/**
 * Parse tool calls from text output when LLM doesn't use proper tool calling format
 * Example: "[list_expenses(startDate=2026-01-31, endDate=2026-01-31)]"
 */
const parseToolCallFromText = (text) => {
  const match = text.match(/\[(\w+)\((.*?)\)\]/);
  if (!match) return null;
  
  const functionName = match[1];
  const argsString = match[2];
  
  // Parse arguments
  const args = {};
  const argPairs = argsString.split(',').map(s => s.trim());
  
  for (const pair of argPairs) {
    const [key, value] = pair.split('=').map(s => s.trim());
    if (key && value) {
      // Remove quotes if present
      args[key] = value.replace(/['"]/g, '');
    }
  }
  
  return { functionName, args };
};

/**
 * Main logic loop for processing user requests through the LLM.
 * Implements tool-calling cycle with conversation history support.
 * @param {string} userMessage - Current user message
 * @param {string} authToken - JWT token for backend authentication
 * @param {Array} history - Optional conversation history [{ role: 'user'|'assistant', content: '...' }]
 * @returns {Promise<string>} Natural language response
 */
export const processChatMessage = async (userMessage, authToken, history = []) => {
  const messages = [
    { role: "system", content: getSystemPrompt() }
  ];
  
  // Add conversation history if provided (for context continuity)
  if (history && history.length > 0) {
    console.log(`[Agent] Including ${history.length} previous messages for context`);
    messages.push(...history);
  }
  
  // Add current user message
  messages.push({ role: "user", content: userMessage });

  // First call to determine if tools are needed
  const response = await openai.chat.completions.create({
    model: LLM_MODEL,
    messages,
    tools: getToolDefinitions(),
    tool_choice: "auto",
  });

  let responseMessage = response.choices[0].message;
  
  // Debug logging
  console.log('[LLM Response]:', {
    hasToolCalls: !!responseMessage.tool_calls,
    toolCallsCount: responseMessage.tool_calls?.length || 0,
    content: responseMessage.content
  });

  // Handle Tool Calls (The LLM wants to execute a backend action)
  if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    messages.push(responseMessage); // Add assistant's tool request
    
    console.log(`[Tool Execution] Processing ${responseMessage.tool_calls.length} tool call(s)...`);
    
    // Process all tool calls
    for (const toolCall of responseMessage.tool_calls) {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      console.log(`[Tool] Executing: ${functionName}`, functionArgs);

      try {
        // Execute the tool implementation (calling backend via Axios)
        const toolResult = await executeTool(functionName, functionArgs, authToken);

        console.log(`[Tool] Success: ${functionName}`, toolResult);

        // Add tool result to conversation
        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: functionName,
          content: JSON.stringify(toolResult),
        });
      } catch (error) {
        console.error(`[Tool-Execution-Error] ${functionName}:`, error.message);
        
        // Add error result to conversation
        const errorMessage = error.response?.data?.message || error.message;
        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: functionName,
          content: JSON.stringify({ error: errorMessage }),
        });
      }
    }

    console.log('[Agent] Getting final response from LLM...');

    // Get final natural language summary from LLM
    try {
      const secondResponse = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages,
        max_tokens: 500, // Limit response length to prevent hanging
        temperature: 0.7,
      });

      const finalContent = secondResponse.choices[0].message.content;
      console.log('[Agent] Final response generated:', finalContent?.substring(0, 100) + '...');
      
      return finalContent || "I've processed your request successfully.";
    } catch (error) {
      console.error(`[LLM-Response-Error]:`, error.message);
      return `I processed your request but encountered an issue generating the response: ${error.message}`;
    }
  }

  // Fallback: Check if the model output contains tool call in text format
  if (responseMessage.content) {
    const parsedToolCall = parseToolCallFromText(responseMessage.content);
    
    if (parsedToolCall) {
      console.log('[Fallback Parser] Detected tool call in text:', parsedToolCall);
      
      try {
        const toolResult = await executeTool(parsedToolCall.functionName, parsedToolCall.args, authToken);
        
        // Format the result as a natural language response
        if (parsedToolCall.functionName === 'list_expenses') {
          if (Array.isArray(toolResult) && toolResult.length === 0) {
            return "You don't have any expenses for today.";
          }
          if (Array.isArray(toolResult)) {
            const total = toolResult.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
            const formatted = toolResult.map(exp => 
              `₹${exp.amount} - ${exp.category_name} (${exp.description || 'No description'}) on ${exp.date}`
            ).join('\n');
            return `Here are your expenses:\n\n${formatted}\n\nTotal: ₹${total.toFixed(2)}`;
          }
        }
        
        if (parsedToolCall.functionName === 'create_expense') {
          return `Added ₹${parsedToolCall.args.amount} for ${parsedToolCall.args.category} on ${parsedToolCall.args.date || 'today'}.`;
        }
        
        return JSON.stringify(toolResult, null, 2);
      } catch (error) {
        console.error(`[Fallback-Tool-Error]:`, error.message);
        const errorMessage = error.response?.data?.message || error.message;
        return `I tried to process your request but encountered an issue: ${errorMessage}`;
      }
    }
  }

  // If no tools were called, return the assistant's direct reply
  return responseMessage.content;
};
