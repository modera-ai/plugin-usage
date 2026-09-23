import type { PluginModule } from "@modera/plugin-sdk";
import { aggregate, type UsageRecord } from "./statistics";
import { UsageStore } from "./store";

export const activate: PluginModule["activate"] = async (host) => {
  const store = new UsageStore(host.storagePath);
  return {
    async runCompleted(event) {
      if (event.trigger === "manual") return;
      const metrics = event.metrics;
      if (!event.completedAt || !metrics || metrics.usageSource !== "provider")
        return;
      const usage = metrics.usage;
      const record: UsageRecord = {
        projectId: event.projectId,
        sessionId: event.sessionId,
        runId: event.runId,
        createdAt: event.completedAt,
        model: metrics.model,
        durationMs: metrics.durationMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        reasoningTokens: usage.reasoningTokens ?? 0,
        ...(event.profileId ? { profileId: event.profileId } : {}),
        ...(event.profileName ? { profileName: event.profileName } : {}),
        ...(event.reasoningEffort
          ? { reasoningEffort: event.reasoningEffort }
          : {}),
        tools: event.messages
          .filter((message) => message.toolProvenance)
          .map((message) => ({
            owner: message.toolProvenance!.owner,
            tool: message.toolProvenance!.tool,
          })),
      };
      if (await store.add(record)) host.invalidateUi?.();
    },
    settings: {
      actions: ["snapshot"],
      async act(action) {
        if (action.id !== "snapshot") throw new Error("Unknown usage action");
        return aggregate(await store.list());
      },
    },
  };
};
