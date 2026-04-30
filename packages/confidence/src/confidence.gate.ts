import type { AgentRegistry, AgentConfig } from '@reaatech/agent-mesh-registry';
import type { ClassifierOutput, ConfidenceDecision } from '@reaatech/agent-mesh';
import { getClarificationQuestion } from '@reaatech/agent-mesh-classifier';
import { clarificationCache } from './clarification.cache.js';
import { env } from '@reaatech/agent-mesh';
import { recordClarification } from '@reaatech/agent-mesh-observability';

export function evaluateConfidenceGate(
  classifierOutput: ClassifierOutput,
  registry: AgentRegistry,
  bypassClassifier: boolean = false,
): ConfidenceDecision {
  const { agent_id, confidence, ambiguous, detected_language } = classifierOutput;

  const matchedAgent = registry.find((a) => a.agent_id === agent_id);

  if (!matchedAgent) {
    const defaultAgent = registry.find((a) => a.is_default);
    return {
      action: 'route',
      agent_id: defaultAgent?.agent_id ?? agent_id,
      confidence,
      reason: `Unknown agent_id '${agent_id}', routing to default`,
    };
  }

  if (matchedAgent.is_default) {
    return {
      action: 'route',
      agent_id: matchedAgent.agent_id,
      confidence,
      reason: 'Default agent, routing directly',
    };
  }

  if (bypassClassifier) {
    return {
      action: 'route',
      agent_id: matchedAgent.agent_id,
      confidence,
      reason: 'Session bypass, routing directly to session agent',
    };
  }

  if (confidence >= matchedAgent.confidence_threshold && !ambiguous) {
    return {
      action: 'route',
      agent_id: matchedAgent.agent_id,
      confidence,
      reason: `Confidence ${confidence} >= threshold ${matchedAgent.confidence_threshold}`,
    };
  }

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

  const defaultAgent = registry.find((a) => a.is_default);
  return {
    action: 'fallback',
    agent_id: defaultAgent?.agent_id ?? agent_id,
    confidence,
    reason: `Below threshold ${matchedAgent.confidence_threshold}, falling back to default`,
  };
}

export async function generateClarificationQuestion(
  agent: AgentConfig,
  _userInput: string,
  language: string,
): Promise<string> {
  const cacheKey = `${agent.agent_id}:${language}`;
  const cached = clarificationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const question = getClarificationQuestion(language);

  clarificationCache.set(cacheKey, question);

  return question;
}
