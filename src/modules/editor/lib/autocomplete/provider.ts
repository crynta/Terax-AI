import {
  DEFAULT_AUTOCOMPLETE_MODEL,
  LMSTUDIO_DEFAULT_BASE_URL,
  type AutocompleteProviderId,
} from "@/modules/ai/config";
import { buildLanguageModel } from "@/modules/ai/lib/agent";
import type { ProviderKeys } from "@/modules/ai/lib/keyring";
import { generateText } from "ai";
import {
  buildUserPrompt,
  COMPLETION_SYSTEM_PROMPT,
  type CompletionRequest,
} from "./prompt";

export type CompletionDeps = {
  provider: AutocompleteProviderId;
  modelId: string;
  keys: ProviderKeys;
  lmstudioBaseURL: string;
};

const MAX_OUTPUT_TOKENS = 128;

export async function requestCompletion(
  req: CompletionRequest,
  deps: CompletionDeps,
  signal: AbortSignal,
): Promise<string> {
  const modelId =
    deps.modelId.trim() || DEFAULT_AUTOCOMPLETE_MODEL[deps.provider];
  const model = buildLanguageModel(deps.provider, deps.keys, modelId, {
    lmstudioBaseURL: deps.lmstudioBaseURL || LMSTUDIO_DEFAULT_BASE_URL,
  });

  // gpt-oss models on Cerebras/Groq are reasoning models — without lowering
  // the reasoning effort they spend the whole token budget thinking and
  // return empty content. Pass the OpenAI-compatible knob through.
  const isGptOss = /\bgpt-oss\b/i.test(modelId);
  const providerOptions = isGptOss
    ? {
        cerebras: { reasoningEffort: "low" },
        groq: { reasoningEffort: "low" },
        openai: { reasoningEffort: "low" },
      }
    : undefined;

  const { text } = await generateText({
    model,
    system: COMPLETION_SYSTEM_PROMPT,
    prompt: buildUserPrompt(req),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 1,
    abortSignal: signal,
    temperature: 0.2,
    ...(providerOptions ? { providerOptions } : {}),
  });

  return cleanCompletion(text);
}

/** Strip accidental fences/labels, trim to a sane suggestion. */
function cleanCompletion(raw: string): string {
  let t = raw;
  // Drop wrapping triple-fence if the model couldn't resist.
  const fence = t.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/);
  if (fence) t = fence[1];
  // If the model echoed a leading marker, drop it.
  t = t.replace(/^<\|cursor\|>/, "");
  return t;
}
