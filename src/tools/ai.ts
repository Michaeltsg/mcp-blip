/**
 * AI / knowledge-base tool — the "ask my AI" requirement (EXPERIMENTAL).
 *
 * Target postmaster: postmaster@ai.msging.net
 *   - mode "knowledge": SET /content/analysis  -> smart-content / knowledge base answer
 *   - mode "intent":    SET /analysis          -> intentions + entities of the sentence
 *
 * Both are read-only in effect (pure analysis, no message is sent to anyone),
 * so they run regardless of BLIP_ALLOW_WRITES. The exact content-analysis
 * contract can vary per account, hence EXPERIMENTAL.
 */
import { z } from "zod";
import { attempt, jsonResult, type ToolContext } from "./shared.js";

const AI = "postmaster@ai.msging.net";
const ANALYSIS_REQUEST_MIME = "application/vnd.iris.ai.analysis-request+json";

export function registerAiTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.registerTool(
    "blip_ask_ai",
    {
      title: "Ask your bot's AI / knowledge base (experimental)",
      description:
        "EXPERIMENTAL. Send a sentence to your bot's AI extension and get a result. " +
        "mode='knowledge' (default) queries the knowledge base / smart content; " +
        "mode='intent' returns detected intentions and entities. No message is sent " +
        "to any user — this only analyzes text.",
      inputSchema: {
        text: z.string().min(1).describe("The sentence/question to analyze."),
        mode: z
          .enum(["knowledge", "intent"])
          .default("knowledge")
          .describe("knowledge = knowledge base answer; intent = intentions/entities."),
        modelId: z
          .string()
          .optional()
          .describe("Optional AI model id; defaults to the last published model."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const uri = args.mode === "knowledge" ? "/content/analysis" : "/analysis";
        const resource: Record<string, unknown> = { text: args.text };
        if (args.modelId) resource["modelId"] = args.modelId;
        const res = await client.sendCommand({
          method: "set",
          to: AI,
          uri,
          type: ANALYSIS_REQUEST_MIME,
          resource,
        });
        return jsonResult(res.resource ?? res);
      }),
  );
}
