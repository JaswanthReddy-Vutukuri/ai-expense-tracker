import { createExpenseTool } from './createExpense.js';
import { listExpensesTool } from './listExpenses.js';
import { modifyExpenseTool } from './modifyExpense.js';
import { deleteExpenseTool } from './deleteExpense.js';
import { clearExpensesTool } from './clearExpenses.js';

// Registry of all available tools
export const tools = [
  createExpenseTool,
  listExpensesTool,
  modifyExpenseTool,
  deleteExpenseTool,
  clearExpensesTool
];

/**
 * Returns tool definitions formatted for OpenAI's tools parameter
 */
export const getToolDefinitions = () => tools.map(t => t.definition);

/**
 * Finds and executes a tool implementation based on its name
 */
export const executeTool = async (name, args, token) => {
  const tool = tools.find(t => t.definition.function.name === name);
  
  if (!tool) {
    throw new Error(`Tool implementation for '${name}' not found.`);
  }

  console.log(`[Tool Execution] Calling ${name} with args:`, args);
  return await tool.run(args, token);
};
