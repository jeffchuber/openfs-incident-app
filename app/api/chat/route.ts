import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createIncidentTools, SYSTEM_PROMPT } from "@/lib/tools";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: SYSTEM_PROMPT,
    messages,
    tools: createIncidentTools(),
    maxSteps: 10,
  });

  return result.toDataStreamResponse();
}
