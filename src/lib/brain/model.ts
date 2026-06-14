import { createOpenAI, openai } from '@ai-sdk/openai';

/**
 * Pluggable "taste brain" model resolver.
 *
 * The brain is an LLM that reasons about a user's movie taste (Akinator-style) and
 * is intentionally backend-agnostic. Priority:
 *   1. LOCAL Ollama  — set OLLAMA_MODEL (e.g. "qwen:latest", "deepseek-r1:32b").
 *      Ollama exposes an OpenAI-compatible API at /v1, so the same provider works;
 *      no extra dependency. Free + private. Override host via OLLAMA_BASE_URL.
 *   2. OpenAI cloud  — used when OPENAI_API_KEY is present and no Ollama model set.
 *   3. Neither       — brainAvailable() is false; callers fall back to the v12
 *      formula engine so the app never hard-fails on a missing LLM runtime.
 */
export function brainAvailable(): boolean {
  return Boolean(process.env.OLLAMA_MODEL || process.env.OPENAI_API_KEY);
}

export function brainBackend(): 'ollama' | 'openai' | 'none' {
  if (process.env.OLLAMA_MODEL) return 'ollama';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'none';
}

/** Returns an AI-SDK LanguageModel for the configured backend, or null if none. */
export function tasteModel() {
  if (process.env.OLLAMA_MODEL) {
    const ollama = createOpenAI({
      baseURL: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434') + '/v1',
      apiKey: 'ollama', // Ollama ignores the key but the SDK requires a non-empty value
    });
    return ollama(process.env.OLLAMA_MODEL);
  }
  if (process.env.OPENAI_API_KEY) {
    return openai(process.env.OPENAI_MODEL || 'gpt-4o');
  }
  return null;
}
