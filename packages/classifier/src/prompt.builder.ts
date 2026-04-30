import type { ClassifierOutput } from '@reaatech/agent-mesh';
import type { AgentRegistry } from '@reaatech/agent-mesh-registry';

const SYSTEM_PROMPT = `You are an intent classifier for a multi-agent system. Your job is to analyze user requests and determine which specialized agent should handle them.

Analyze the user's request and the available agents below. Return a JSON object with:
- agent_id: The ID of the best-matching agent
- confidence: A score from 0.0 to 1.0 indicating how confident you are in the match
- ambiguous: Whether the request could reasonably match multiple agents
- detected_language: The ISO 639-1 language code of the user's input
- intent_summary: A one-sentence summary of what the user wants
- entities: Any relevant entities extracted from the request (key-value pairs)

Classification guidelines:
- If the request clearly matches one agent's domain, use high confidence (0.8-1.0)
- If the request could match multiple agents, set ambiguous=true and use moderate confidence
- If no specialized agent is a good match, route to the default agent
- Always detect the language of the user's input
- Extract relevant entities that might help the target agent`;

export function buildClassifierPrompt(
  registry: AgentRegistry,
  userInput: string,
  detectedLanguage?: string,
): string {
  const agentSections = registry
    .map((agent) => {
      const examplesSection = agent.examples.map((ex) => `    - "${ex}"`).join('\n');

      return `### ${agent.display_name} (${agent.agent_id})
Description: ${agent.description}
Examples of queries for this agent:
${examplesSection}
${agent.clarification_context ? `Clarification context: ${agent.clarification_context}` : ''}
`;
    })
    .join('\n');

  const languageHint = detectedLanguage
    ? `\nNote: The user's previous messages suggest they prefer ${detectedLanguage}. Consider this when detecting language.`
    : '';

  return `${SYSTEM_PROMPT}

## Available Agents

${agentSections}

## User Request

User: "${userInput}"${languageHint}

## Response

Return ONLY a valid JSON object matching this schema:
{
  "agent_id": "string",
  "confidence": number (0.0-1.0),
  "ambiguous": boolean,
  "detected_language": "string (ISO 639-1)",
  "intent_summary": "string",
  "entities": {}
}

JSON:`;
}

export function parseClassifierOutput(jsonStr: string): ClassifierOutput {
  let cleaned = jsonStr.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  if (typeof parsed.agent_id !== 'string') {
    throw new Error('Missing or invalid agent_id');
  }
  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error('Missing or invalid confidence (must be 0.0-1.0)');
  }
  if (typeof parsed.detected_language !== 'string') {
    throw new Error('Missing or invalid detected_language');
  }
  if (typeof parsed.intent_summary !== 'string') {
    throw new Error('Missing or invalid intent_summary');
  }

  return {
    agent_id: parsed.agent_id,
    confidence: parsed.confidence,
    ambiguous: parsed.ambiguous ?? false,
    detected_language: parsed.detected_language,
    intent_summary: parsed.intent_summary,
    entities: parsed.entities ?? {},
  };
}
