import { createOpenAI } from "@ai-sdk/openai";
import {
  Experimental_Agent as Agent,
  DirectChatTransport,
  stepCountIs,
} from "ai";
import { DEFAULT_MODEL_ID, MAX_AGENT_STEPS, SYSTEM_PROMPT } from "../config";
import { logger } from "../logger";
import { buildTools, type ToolContext } from "../tools/tools";

type AgentDeps = {
  apiKey: string;
  toolContext: ToolContext;
};

export function createTeraxAgent({ apiKey, toolContext }: AgentDeps) {
  const openai = createOpenAI({ apiKey });
  return new Agent({
    model: openai(DEFAULT_MODEL_ID),
    instructions: SYSTEM_PROMPT,
    tools: buildTools(toolContext),
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    onStepFinish: (step) => {
      logger.group("step.finish", {
        text: step.text,
        toolCalls: step.toolCalls,
        toolResults: step.toolResults,
        finishReason: step.finishReason,
        usage: step.usage,
      });
    },
    onFinish: (r) => {
      logger.group("agent.finish", {
        steps: r.steps.length,
        totalUsage: r.totalUsage,
      });
    },
  });
}

export type TeraxAgent = ReturnType<typeof createTeraxAgent>;

export function createTeraxTransport(agent: TeraxAgent) {
  return new DirectChatTransport({ agent });
}
