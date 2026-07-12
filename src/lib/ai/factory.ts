import { DeterministicAiProvider } from "@/lib/ai/provider";
import { GeminiProvider } from "@/lib/ai/gemini-provider";

export function getAiProvider() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new DeterministicAiProvider();
  }

  return new GeminiProvider(apiKey, process.env.GEMINI_MODEL);
}
