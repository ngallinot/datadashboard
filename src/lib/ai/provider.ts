import "server-only";

/**
 * Model provider abstraction. The app only ever calls `getProvider().complete(...)`.
 * - AnthropicProvider: Claude via the official SDK when ANTHROPIC_API_KEY is set (model from ANTHROPIC_MODEL).
 * - LocalProvider:     deterministic, no network; answers library questions and declines free-form ones.
 * Production on CSIU infrastructure swaps this module for an on-prem or vendor-hosted model behind the same interface.
 */
export interface CompletionRequest {
  system: string;
  user: string;
  /** Ask for strict JSON output; providers that can enforce it will. */
  json?: boolean;
  maxTokens?: number;
}
export interface CompletionResult { text: string; provider: string; model: string }

export interface ModelProvider {
  readonly id: string;
  readonly model: string;
  readonly isLive: boolean;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

let cached: ModelProvider | undefined;
export async function getProvider(): Promise<ModelProvider> {
  if (cached) return cached;
  const forced = process.env.AI_PROVIDER;
  if (forced !== "local" && process.env.ANTHROPIC_API_KEY) {
    const { AnthropicProvider } = await import("./anthropic");
    cached = new AnthropicProvider(process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5");
  } else {
    const { LocalProvider } = await import("./local");
    cached = new LocalProvider();
  }
  return cached;
}

export function providerStatus() {
  return { live: !!process.env.ANTHROPIC_API_KEY && process.env.AI_PROVIDER !== "local", model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5" };
}
