/** Registers every tool on the MCP server. */
import type { ToolContext } from "./shared.js";
import { registerContactTools } from "./contacts.js";
import { registerBucketTools } from "./buckets.js";
import { registerBroadcastTools } from "./broadcast.js";
import { registerScheduleTools } from "./schedules.js";
import { registerAiTools } from "./ai.js";
import { registerMessageTools } from "./messages.js";
import { registerCommandTool } from "./command.js";
import { registerContextTools } from "./context.js";
import { registerThreadTools } from "./threads.js";
import { registerFlowTools } from "./flow.js";
import { registerEventTools } from "./events.js";
import { registerFlowMapTools } from "./flow-tools.js";

export type { ToolContext } from "./shared.js";

export function registerAllTools(ctx: ToolContext): void {
  // Contacts & storage
  registerContactTools(ctx);
  registerBucketTools(ctx);
  // Conversation & journey debugging
  registerThreadTools(ctx);
  registerContextTools(ctx);
  registerFlowTools(ctx);
  registerEventTools(ctx);
  // Flow mapping / multi-flow
  registerFlowMapTools(ctx);
  // Reach & automation
  registerBroadcastTools(ctx);
  registerScheduleTools(ctx);
  registerAiTools(ctx);
  registerMessageTools(ctx);
  // Generic escape hatch
  registerCommandTool(ctx);
}
