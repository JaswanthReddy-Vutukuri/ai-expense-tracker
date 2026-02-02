/**
 * This file serves as a reference for the structure 
 * each tool must follow for the MCP (Model Context Protocol) pattern.
 */
export const ToolInterface = {
  /**
   * The definition following OpenAI's Chat Completion Tool schema
   */
  definition: {
    type: "function",
    function: {
      name: "string",
      description: "string",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  /**
   * The actual implementation logic triggered when the LLM calls the function
   * @param {Object} args - Arguments parsed by the LLM
   * @param {string} token - The user's JWT for authentication forwarding
   */
  run: async (args, token) => {
    // Logic to call backendClient
  }
};
