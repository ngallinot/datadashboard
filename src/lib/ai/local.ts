import "server-only";
import type { CompletionRequest, CompletionResult, ModelProvider } from "./provider";

/**
 * No-network provider. The ask engine answers library questions deterministically before ever calling a provider,
 * so this provider only has to decline free-form questions gracefully.
 */
export class LocalProvider implements ModelProvider {
  readonly id = "local";
  readonly model = "deterministic";
  readonly isLive = false;
  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    return { text: JSON.stringify({ unsupported: true }), provider: this.id, model: this.model };
  }
}
