/**
 * Gemini Flash classifier service for intent classification
 * Uses Vertex AI to classify user requests and route to appropriate agents
 */

import type { AgentRegistry } from '../registry/types.js';
import type { ClassifierOutput } from '../types/domain.js';
import { buildClassifierPrompt, parseClassifierOutput } from './prompt.builder.js';
import { detectLanguage } from './localization.js';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';

/** Gemini API response type */
interface GeminiResponse {
  response?: {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
}

/** Rate limit retry configuration */
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Check if an error is a Gemini rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('rate limit') ||
      msg.includes('quota') ||
      msg.includes('429') ||
      msg.includes('resource exhausted')
    );
  }
  return false;
}

/**
 * Sleep for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock classifier for development/testing when GCP is not available
 * Uses simple keyword matching for routing
 */
class MockClassifier {
  classify(userInput: string, registry: AgentRegistry): ClassifierOutput {
    const input = userInput.toLowerCase();
    const detectedLanguage = detectLanguage(userInput);

    // Simple keyword-based routing for development
    for (const agent of registry) {
      if (agent.is_default) {
        continue;
      }

      // Check if any examples match keywords in the input
      for (const example of agent.examples) {
        const exampleWords = example.toLowerCase().split(/\s+/);
        const matchCount = exampleWords.filter((w) => w.length > 3 && input.includes(w)).length;
        if (matchCount >= 2) {
          return {
            agent_id: agent.agent_id,
            confidence: 0.8,
            ambiguous: false,
            detected_language: detectedLanguage,
            intent_summary: `User request matches ${agent.display_name} domain`,
            entities: {},
          };
        }
      }
    }

    // Fall back to default agent
    const defaultAgent = registry.find((a) => a.is_default);
    if (!defaultAgent) {
      throw new Error('No default agent found in registry');
    }

    return {
      agent_id: defaultAgent.agent_id,
      confidence: 0.5,
      ambiguous: false,
      detected_language: detectedLanguage,
      intent_summary: 'General request routed to default agent',
      entities: {},
    };
  }
}

/**
 * Production classifier using Vertex AI Gemini
 */
class GeminiClassifier {
  private model: unknown = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Dynamic import to avoid build errors when package is not installed

      const vertexai = await import('@google-cloud/vertexai');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const VertexAI = (vertexai as any).VertexAI;

      const vertexAI = new VertexAI({
        project: env.GOOGLE_CLOUD_PROJECT,
        location: env.VERTEX_AI_LOCATION,
      });

      this.model = vertexAI.getGenerativeModel({
        model: env.VERTEX_AI_MODEL,
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 0.5,
        },
      });

      this.initialized = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown';
      logger.warn('Failed to initialize Gemini', { error: msg });
      throw error;
    }
  }

  async classify(
    userInput: string,
    registry: AgentRegistry,
    _detectedLanguage?: string,
  ): Promise<ClassifierOutput> {
    await this.init();

    if (!this.model) {
      throw new Error('Gemini model not initialized');
    }

    const prompt = buildClassifierPrompt(registry, userInput, _detectedLanguage);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const model = this.model as { generateContent: (req: unknown) => Promise<unknown> };
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const response = result as GeminiResponse;
        const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        if (!text) {
          throw new Error('Empty response from Gemini');
        }

        return parseClassifierOutput(text);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (isRateLimitError(error) && attempt < MAX_RETRY_ATTEMPTS) {
          const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          logger.warn('Rate limit hit, retrying', {
            delayMs,
            attempt,
            maxAttempts: MAX_RETRY_ATTEMPTS,
          });
          await sleep(delayMs);
          continue;
        }

        break;
      }
    }

    throw lastError ?? new Error('Gemini classification failed');
  }
}

/**
 * Classifier service with fallback to mock implementation
 */
export class ClassifierService {
  private geminiClassifier: GeminiClassifier | null = null;
  private mockClassifier: MockClassifier;
  private useMock = false;

  constructor() {
    this.mockClassifier = new MockClassifier();

    if (env.NODE_ENV !== 'test') {
      const gemini = new GeminiClassifier();
      gemini.init().catch(() => {
        logger.info('Using mock classifier (Gemini unavailable)');
        this.useMock = true;
      });
      this.geminiClassifier = gemini;
    } else {
      this.useMock = true;
    }
  }

  /**
   * Classify a user request and determine the best agent
   */
  async classify(
    userInput: string,
    registry: AgentRegistry,
    priorLanguage?: string,
  ): Promise<ClassifierOutput> {
    try {
      if (this.useMock || !this.geminiClassifier) {
        return this.mockClassifier.classify(userInput, registry);
      }

      return await this.geminiClassifier.classify(userInput, registry, priorLanguage);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown';
      logger.warn('Classifier falling back to mock', { error: msg });
      this.useMock = true;
      return this.mockClassifier.classify(userInput, registry);
    }
  }

  /**
   * Check if the classifier is using the mock implementation
   */
  isMock(): boolean {
    return this.useMock;
  }
}

// Singleton instance
export const classifierService = new ClassifierService();
