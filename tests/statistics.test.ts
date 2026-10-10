import { describe, expect, it } from "vitest";
import { aggregate, type UsageRecord } from "../src/statistics";

const record = (overrides: Partial<UsageRecord>): UsageRecord => ({
  projectId: "p",
  sessionId: "s",
  runId: "r",
  createdAt: "2026-09-18T08:00:00.000Z",
  model: "model",
  durationMs: 60_000,
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 70,
  cacheWriteTokens: 0,
  reasoningTokens: 5,
  ...overrides,
});

describe("usage statistics", () => {
  it("does not double count cache tokens and computes streaks", () => {
    const result = aggregate(
      [
        record({
          runId: "a",
          createdAt: "2026-09-18T08:00:00",
          durationMs: 90_000,
        }),
        record({
          runId: "b",
          createdAt: "2026-09-19T08:00:00",
          inputTokens: 50,
          outputTokens: 10,
        }),
        record({
          runId: "c",
          createdAt: "2026-09-20T08:00:00",
          inputTokens: 20,
          outputTokens: 5,
          model: "model-pro",
          profileId: "anthropic",
          profileName: "Claude 主配置",
          reasoningEffort: "high",
          tools: [{ owner: "modera.filesystem", tool: "filesystem_read" }],
        }),
      ],
      new Date("2026-09-20T12:00:00"),
    );
    expect(result.totalTokens).toBe(205);
    expect(result.cacheReadTokens).toBe(210);
    expect(result.peakTokens).toBe(120);
    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(3);
    expect(result.longestDurationMs).toBe(90_000);
    expect(result.models.map((item) => item.name)).toEqual([
      "model",
      "model-pro",
    ]);
    expect(result.profiles[0]).toMatchObject({ name: "default", runs: 2 });
    expect(result.profiles[1]).toMatchObject({ name: "Claude 主配置", runs: 1 });
    expect(result.efforts[0]).toMatchObject({ name: "unknown", runs: 2 });
    expect(result.tools[0]).toMatchObject({
      owner: "modera.filesystem",
      tool: "filesystem_read",
      runs: 1,
    });
  });
});
