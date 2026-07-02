import type { ClassifierOutput } from '@reaatech/agent-mesh';
import type { AgentRegistry } from '@reaatech/agent-mesh-registry';

/**
 * Pluggable intent classifier.
 *
 * Implement this to supply an alternative to the built-in Gemini classifier —
 * e.g. a self-hosted model, a different provider, or a host-resolved model
 * (letting the embedding application, rather than agent-mesh, own the inference
 * call). Both the built-in `GeminiClassifier` and `MockClassifier` implement it.
 *
 * Inject via `new ClassifierService(provider)` or {@link createClassifier}.
 * `classify` may be synchronous or asynchronous — `ClassifierService` awaits the
 * result either way.
 */
export interface ClassifierProvider {
  classify(
    userInput: string,
    registry: AgentRegistry,
    priorLanguage?: string,
  ): ClassifierOutput | Promise<ClassifierOutput>;
}
