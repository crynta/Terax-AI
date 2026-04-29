export type CompletionRequest = {
  prefix: string;
  suffix: string;
  language: string | null;
  filename: string | null;
};

const MAX_PREFIX = 2000;
const MAX_SUFFIX = 1000;

export function trimContext(prefix: string, suffix: string) {
  const p = prefix.length > MAX_PREFIX ? prefix.slice(prefix.length - MAX_PREFIX) : prefix;
  const s = suffix.length > MAX_SUFFIX ? suffix.slice(0, MAX_SUFFIX) : suffix;
  return { prefix: p, suffix: s };
}

export const COMPLETION_SYSTEM_PROMPT = `You are a code-completion engine. Output ONLY the raw code that should appear next at the cursor. No markdown fences. No prose. No commentary. No reasoning. Just the code to insert.`;

export function buildUserPrompt(req: CompletionRequest): string {
  const { prefix, suffix } = trimContext(req.prefix, req.suffix);
  const header: string[] = [];
  if (req.filename) header.push(`// File: ${req.filename}`);
  if (req.language) header.push(`// Language: ${req.language}`);
  const headerBlock = header.length ? header.join("\n") + "\n" : "";

  // Chat-style prompt: give the model the code BEFORE the cursor as the
  // primary input, mention what's after the cursor as context, and ask for
  // the inline continuation. Avoids FIM-style markers that reasoning models
  // tend to refuse on.
  const suffixHint = suffix.trim()
    ? `\n\nThe code AFTER the cursor (do not repeat it) is:\n\`\`\`\n${suffix}\n\`\`\``
    : "";
  return `Continue the following code from where it stops. Output ONLY the new code to insert — 1 to 10 lines. Do not repeat anything already shown. Do not wrap in backticks.

${headerBlock}\`\`\`
${prefix}\`\`\`${suffixHint}`;
}
