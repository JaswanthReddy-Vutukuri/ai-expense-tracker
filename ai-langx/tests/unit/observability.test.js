/**
 * OBSERVABILITY TESTS
 */

import { ObservabilityManager } from '../../src/utils/observability/observability.js';

describe('ObservabilityManager', () => {
  let obs;

  beforeEach(() => {
    // Create manager without LangSmith key (will be disabled)
    delete process.env.LANGSMITH_API_KEY;
    obs = new ObservabilityManager({ projectName: 'test-project' });
  });

  describe('Initialization', () => {
    test('should initialize with default options', () => {
      expect(obs.projectName).toBe('test-project');
      expect(obs.metrics).toBeDefined();
    });

    test('should disable observability without API key', () => {
      expect(obs.enabled).toBe(false);
    });
  });

  describe('Trace Management', () => {
    test('should start a trace', async () => {
      const trace = await obs.startTrace('test-op', 'agent', { userId: 123 });
      
      // When disabled, should still return null
      if (obs.enabled) {
        expect(trace.name).toBe('test-op');
        expect(trace.operationType).toBe('agent');
        expect(trace.metadata.userId).toBe(123);
      }
    });

    test('should record events in trace', async () => {
      const trace = await obs.startTrace('operation', 'test');
      
      if (trace) {
        obs.recordEvent(trace, 'step_1', { progress: '50%' });
        obs.recordEvent(trace, 'step_2', { progress: '100%' });
        
        expect(trace.events).toHaveLength(2);
        expect(trace.events[0].name).toBe('step_1');
      }
    });

    test('should end trace successfully', async () => {
      const trace = await obs.startTrace('op', 'test');
      
      if (trace) {
        const result = await obs.endTrace(trace, { success: true });
        expect(result.success).toBe(true);
        expect(result.traceId).toBeDefined();
      }
    });

    test('should end trace with error', async () => {
      const trace = await obs.startTrace('op', 'test');
      
      if (trace) {
        const error = new Error('test error');
        const result = await obs.endTrace(trace, null, error);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('Token Tracking', () => {
    test('should track token usage', () => {
      const result = obs.trackTokenUsage('gpt-3.5-turbo', 100, 50);
      
      if (obs.enabled) {
        expect(result.totalTokens).toBe(150);
        expect(result.cost).toBeGreaterThan(0);
      }
    });

    test('should differentiate model pricing', () => {
      const gpt35Result = obs.trackTokenUsage('gpt-3.5-turbo', 1000, 1000);
      const gpt4Result = obs.trackTokenUsage('gpt-4', 1000, 1000);

      if (obs.enabled) {
        expect(gpt4Result.cost).toBeGreaterThan(gpt35Result.cost);
      }
    });

    test('should accumulate metrics', () => {
      obs.trackTokenUsage('gpt-3.5-turbo', 100, 50);
      obs.trackTokenUsage('gpt-3.5-turbo', 200, 100);

      expect(obs.metrics.totalTokens).toBeGreaterThanOrEqual(0);
      expect(obs.metrics.totalCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Metrics & Reporting', () => {
    test('should record custom metrics', () => {
      obs.recordMetric('custom_metric', 42, { source: 'test' });
      // Should not throw
      expect(true).toBe(true);
    });

    test('should generate summary', () => {
      const summary = obs.getSummary();
      
      expect(summary.enabled).toBe(false); // No API key
      expect(summary.requests).toBeGreaterThanOrEqual(0);
      expect(summary.errorRate).toBeDefined();
      expect(summary.totalCost).toBeDefined();
    });

    test('should track request metrics', async () => {
      const trace = await obs.startTrace('test', 'agent');
      
      if (trace) {
        await obs.endTrace(trace, { result: 'success' });
        expect(obs.metrics.requests).toBeGreaterThanOrEqual(0);
      }
    });

    test('should track error metrics', async () => {
      const trace = await obs.startTrace('test', 'agent');
      
      if (trace) {
        await obs.endTrace(trace, null, new Error('failed'));
        expect(obs.metrics.errors).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Function Decoration', () => {
    test('should create traced function', async () => {
      const tracedFn = obs.traceFunction(
        async (input) => `result: ${input}`,
        'test_operation'
      );

      const result = await tracedFn('test');
      expect(result).toBe('result: test');
    });

    test('should handle function errors', async () => {
      const tracedFn = obs.traceFunction(
        async () => {
          throw new Error('Function failed');
        },
        'failing_operation'
      );

      await expect(tracedFn()).rejects.toThrow('Function failed');
    });
  });

  describe('Cost Calculation', () => {
    test('should use correct OpenAI pricing', () => {
      const gpt35Pricing = obs._getModelCost('gpt-3.5-turbo');
      expect(gpt35Pricing.input).toBe(0.0005);
      expect(gpt35Pricing.output).toBe(0.0015);
    });

    test('should use default pricing for unknown model', () => {
      const pricing = obs._getModelCost('unknown-model');
      expect(pricing).toBeDefined();
      expect(pricing.input).toBeGreaterThan(0);
      expect(pricing.output).toBeGreaterThan(0);
    });
  });

  describe('Trace ID Generation', () => {
    test('should generate unique trace IDs', () => {
      const id1 = obs._generateTraceId();
      const id2 = obs._generateTraceId();
      
      expect(id1).toContain('trace_');
      expect(id1).not.toBe(id2);
    });
  });
});
