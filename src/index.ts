import { definePlugin, type PluginModule } from "@pal/plugin-sdk";
import { aggregate, type UsageRecord } from "./statistics";
import { UsageStore } from "./store";
import manifest from "../plugin.json";

export const activate: PluginModule["activate"] = async (host) => {
  const store = new UsageStore(host.storagePath);
  const registered = await definePlugin(pal => {
    const declaration = manifest.declarations.provides.commands[0]!;
    pal.commands.register({ ...declaration, visibility: "private", run: async (_input, execution) => {
      execution.context.signal.throwIfAborted();
      const result = aggregate(await store.list());
      execution.context.signal.throwIfAborted();
      return result;
    } });
  }).activate(host);
  return {
    ...registered,
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
    settings: { commands: ["pal.usage.snapshot"] },
  };
};
