/**
 * STREAMING RESPONSES - Phase 4
 * 
 * PURPOSE:
 * - Stream responses to client in real-time
 * - Show progress during long operations
 * - Reduce perceived latency
 * 
 * FEATURES:
 * ✅ Streaming LLM responses
 * ✅ Progress updates
 * ✅ Server-Sent Events (SSE)
 * ✅ Error handling with streaming
 */

/**
 * Stream response helper
 * Sends data chunks using Server-Sent Events
 */
export function streamResponse(res) {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  return {
    /**
     * Send data chunk
     */
    sendEvent(event, data) {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },

    /**
     * Send progress update
     */
    sendProgress(current, total, message) {
      this.sendEvent('progress', {
        current,
        total,
        percentage: Math.round((current / total) * 100),
        message,
        timestamp: Date.now()
      });
    },

    /**
     * Send token chunk (for LLM streaming)
     */
    sendToken(token, metadata = {}) {
      this.sendEvent('token', {
        token,
        metadata,
        timestamp: Date.now()
      });
    },

    /**
     * Send complete message
     */
    sendMessage(content, metadata = {}) {
      this.sendEvent('message', {
        content,
        metadata,
        timestamp: Date.now()
      });
    },

    /**
     * Send error
     */
    sendError(error, code = 'ERROR') {
      this.sendEvent('error', {
        code,
        message: error.message || error,
        timestamp: Date.now()
      });
    },

    /**
     * Complete stream
     */
    done(result = null) {
      this.sendEvent('done', {
        result,
        timestamp: Date.now()
      });
      res.end();
    },

    /**
     * Keep connection alive
     */
    keepAlive() {
      res.write(': heartbeat\n\n');
    }
  };
}

/**
 * Stream wrapper for async generators
 * Converts async generator to streamed response
 */
export async function streamAsyncGenerator(res, generator, options = {}) {
  const streamer = streamResponse(res);
  const { onError, onComplete, keepAlive = true } = options;

  let index = 0;

  try {
    for await (const chunk of generator) {
      if (chunk.type === 'progress') {
        streamer.sendProgress(chunk.current, chunk.total, chunk.message);
      } else if (chunk.type === 'token') {
        streamer.sendToken(chunk.token, chunk.metadata);
      } else if (chunk.type === 'message') {
        streamer.sendMessage(chunk.content, chunk.metadata);
      } else if (chunk.type === 'event') {
        streamer.sendEvent(chunk.name, chunk.data);
      } else {
        streamer.sendMessage(chunk);
      }

      index++;

      // Send keepalive every 30 chunks
      if (keepAlive && index % 30 === 0) {
        streamer.keepAlive();
      }
    }

    const result = onComplete?.(index);
    streamer.done(result);
  } catch (error) {
    streamer.sendError(error);
    onError?.(error);
    streamer.done({ error: error.message });
  }
}

/**
 * OpenAI Streaming Helper
 * Handles streaming from OpenAI LLM
 */
export async function streamFromOpenAI(res, stream, options = {}) {
  const streamer = streamResponse(res);
  const { onComplete } = options;

  let fullContent = '';
  let tokenCount = 0;

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        fullContent += delta.content;
        streamer.sendToken(delta.content, {
          tokenCount: ++tokenCount,
          totalChars: fullContent.length
        });
      }

      if (delta?.function_call) {
        streamer.sendEvent('function_call', delta.function_call);
      }
    }

    const result = onComplete?.(fullContent, tokenCount);
    streamer.sendMessage(fullContent);
    streamer.done(result);
  } catch (error) {
    streamer.sendError(error);
    streamer.done({ error: error.message });
  }
}

/**
 * Express middleware for streaming routes
 */
export function enableStreaming(req, res, next) {
  // Attach streaming utilities
  res.stream = streamResponse(res);
  res.streamGenerator = (generator, options) => streamAsyncGenerator(res, generator, options);
  res.streamOpenAI = (stream, options) => streamFromOpenAI(res, stream, options);

  next();
}

/**
 * Async Generator for streaming operations
 */
export async function* streamReconciliation(coordinator) {
  const total = 5;

  // Stage 1: Fetch app expenses
  yield {
    type: 'progress',
    current: 1,
    total,
    message: 'Fetching app expenses...'
  };

  const appExpenses = await coordinator.fetchAppExpenses();

  yield {
    type: 'event',
    name: 'expenses_fetched',
    data: { count: appExpenses.length }
  };

  // Stage 2: Fetch PDFs
  yield {
    type: 'progress',
    current: 2,
    total,
    message: 'Fetching PDF receipts...'
  };

  const pdfReceipts = await coordinator.fetchPDFReceipts();

  yield {
    type: 'event',
    name: 'pdfs_fetched',
    data: { count: pdfReceipts.length }
  };

  // Stage 3: Compare
  yield {
    type: 'progress',
    current: 3,
    total,
    message: 'Comparing transactions...'
  };

  const matches = await coordinator.compareTransactions(appExpenses);

  yield {
    type: 'event',
    name: 'comparison_complete',
    data: { matches: matches.length }
  };

  // Stage 4: Analyze
  yield {
    type: 'progress',
    current: 4,
    total,
    message: 'Analyzing discrepancies...'
  };

  const discrepancies = await coordinator.analyzeDiscrepancies(matches);

  yield {
    type: 'event',
    name: 'analysis_complete',
    data: { discrepancies: discrepancies.length }
  };

  // Stage 5: Generate report
  yield {
    type: 'progress',
    current: 5,
    total,
    message: 'Generating report...'
  };

  const report = await coordinator.generateReport(matches, discrepancies);

  return report;
}

/**
 * Async Generator for streaming chat
 */
export async function* streamChat(message, agent, options = {}) {
  const { onProgress, onComplete } = options;

  yield {
    type: 'event',
    name: 'chat_start',
    data: { message }
  };

  try {
    const response = await agent.run(message, { stream: true });

    for await (const token of response) {
      yield {
        type: 'token',
        token,
        metadata: { source: 'agent' }
      };

      onProgress?.(token);
    }

    onComplete?.();
  } catch (error) {
    throw new Error(`Chat failed: ${error.message}`);
  }
}

export default streamResponse;
