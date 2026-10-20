import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, CompletionResult, ModelProvider } from "./provider";

/** Claude through the official SDK. The key is read from ANTHROPIC_API_KEY by the SDK itself. */
export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  readonly isLive = true;
  private client = new Anthropic();
  constructor(readonly model: string) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 4000,
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],   // the schema doc is stable per role; cache it
        messages: [{ role: "user", content: req.json ? `${req.user}\n\nRespond with a single JSON object and nothing else.` : req.user }],
        output_config: { effort: "low" },   // text-to-SQL over a documented schema does not need deep reasoning
      });
      if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      return { text, provider: this.id, model: this.model };
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new Error("Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
      if (error instanceof Anthropic.RateLimitError) throw new Error("The model is rate-limited right now. Try again in a moment.");
      if (error instanceof Anthropic.APIError) throw new Error(`Model request failed (${error.status}): ${error.message}`);
      throw error;
    }
  }
}
