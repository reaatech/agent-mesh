/**
 * Confidence gate for routing decisions
 * Evaluates classifier output against agent thresholds and generates clarification if needed
 */

import type { AgentRegistry, AgentConfig } from '../registry/types.js';
import type { ClassifierOutput, ConfidenceDecision } from '../types/domain.js';
import { getClarificationQuestion } from '../classifier/localization.js';
import { clarificationCache } from './clarification.cache.js';
import { env } from '../config/env.js';
import { recordClarification } from '../observability/metrics.js';

/**
 * Evaluate the confidence gate decision tree
 *
 * Decision order:
 * 1. Unknown agent_id → route to default
 * 2. Default agent → always route directly (no threshold check)
 * 3. Confidence ≥ threshold AND not ambiguous → route to matched agent
 * 4. clarification_required → generate clarification question
 * 5. Otherwise → fall back to default
 */
export function evaluateConfidenceGate(
  classifierOutput: ClassifierOutput,
  registry: AgentRegistry,
  bypassClassifier: boolean = false,
): ConfidenceDecision {
  const { agent_id, confidence, ambiguous, detected_language } = classifierOutput;

  // Find the matched agent
  const matchedAgent = registry.find((a) => a.agent_id === agent_id);

  // Rule 1: Unknown agent_id → route to default
  if (!matchedAgent) {
    const defaultAgent = registry.find((a) => a.is_default);
    return {
      action: 'route',
      agent_id: defaultAgent?.agent_id ?? agent_id,
      confidence,
      reason: `Unknown agent_id '${agent_id}', routing to default`,
    };
  }

  // Rule 2: Default agent → always route directly (no threshold check)
  if (matchedAgent.is_default) {
    return {
      action: 'route',
      agent_id: matchedAgent.agent_id,
      confidence,
      reason: 'Default agent, routing directly',
    };
  }

  // If bypass classifier is set (active session), route directly
  if (bypassClassifier) {
    return {
      action: 'route',
      agent_id: matchedAgent.agent_id,
      confidence,
      reason: 'Session bypass, routing directly to session agent',
    };
  }

  // Rule 3: Confidence ≥ threshold AND not ambiguous → route to matched agent
  if (confidence >= matchedAgent.confidence_threshold && !ambiguous) {
    return {
      action: 'route',
      agent_id: matchedAgent.agent_id,
      confidence,
      reason: `Confidence ${confidence} >= threshold ${matchedAgent.confidence_threshold}`,
    };
  }

  // Rule 4: clarification_required → generate clarification question
  if (matchedAgent.clarification_required && env.ENABLE_CLARIFICATION) {
    const cacheKey = `${matchedAgent.agent_id}:${detected_language}`;
    const clarificationQuestion =
      clarificationCache.get(cacheKey) ?? getClarificationQuestion(detected_language);
    clarificationCache.set(cacheKey, clarificationQuestion);
    recordClarification(matchedAgent.agent_id);
    return {
      action: 'clarify',
      agent_id: matchedAgent.agent_id,
      confidence,
      clarification_question: clarificationQuestion,
      reason: `Below threshold ${matchedAgent.confidence_threshold}, clarification required`,
    };
  }

  // Rule 5: Otherwise → fall back to default
  const defaultAgent = registry.find((a) => a.is_default);
  return {
    action: 'fallback',
    agent_id: defaultAgent?.agent_id ?? agent_id,
    confidence,
    reason: `Below threshold ${matchedAgent.confidence_threshold}, falling back to default`,
  };
}

/**
 * Generate a clarification question for a specific agent
 * Uses cache to avoid redundant generation
 */
export async function generateClarificationQuestion(
  agent: AgentConfig,
  _userInput: string,
  language: string,
): Promise<string> {
  // Check cache first
  const cacheKey = `${agent.agent_id}:${language}`;
  const cached = clarificationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Use fallback question (production would use Gemini to generate contextual questions)
  const question = getClarificationQuestion(language);

  // Cache the result
  clarificationCache.set(cacheKey, question);

  return question;
}
