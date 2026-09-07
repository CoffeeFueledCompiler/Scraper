// Thin wrapper around OpenRouter's chat completions API (OpenAI-compatible):
// model choice, retry/backoff, cost tracking. Plain fetch — no SDK needed.

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Rough per-1M-token prices (USD), for cost estimate logging. Update if pricing changes.
const PRICES: Record<string, [number, number]> = { "openai/gpt-4o-mini": [0.15, 0.6] };

type OpenRouterResponse = {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export class AIClient {
  private model: string;
  private apiKey: string;
  promptTokens = 0;
  completionTokens = 0;
  calls = 0;

  constructor(model = DEFAULT_MODEL) {
    this.model = model;
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("The OPENROUTER_API_KEY environment variable is missing or empty.");
    this.apiKey = apiKey;
  }

  private async callWithRetry(systemPrompt: string, userPrompt: string, attempts = 4): Promise<OpenRouterResponse> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Local Business Lead Generator",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });
        if (!res.ok) throw new Error(`OpenRouter API error ${res.status}: ${await res.text()}`);
        return await res.json();
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, Math.min(30000, 1000 * 2 ** i) * (0.5 + Math.random())));
      }
    }
    throw lastErr;
  }

  async generateJson<T extends Record<string, unknown>>(
    systemPrompt: string,
    userPrompt: string,
    requiredKeys: string[]
  ): Promise<T | null> {
    const response = await this.callWithRetry(systemPrompt, userPrompt);
    this.calls++;
    if (response.usage) {
      this.promptTokens += response.usage.prompt_tokens ?? 0;
      this.completionTokens += response.usage.completion_tokens ?? 0;
    }

    const content = response.choices?.[0]?.message?.content;
    if (!content) return null;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(content);
    } catch {
      return null;
    }
    if (!requiredKeys.every((k) => k in data)) return null;
    return data as T;
  }

  usage() {
    const prices = PRICES[this.model];
    const cost = prices ? (this.promptTokens / 1_000_000) * prices[0] + (this.completionTokens / 1_000_000) * prices[1] : null;
    return { calls: this.calls, promptTokens: this.promptTokens, completionTokens: this.completionTokens, cost };
  }
}
