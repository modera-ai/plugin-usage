import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { UsageStore } from "../src/store";

const paths: string[] = [];
afterEach(async () =>
  Promise.all(
    paths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  ),
);

it("persists records and deduplicates replayed runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "modera-usage-"));
  paths.push(root);
  const store = new UsageStore(root);
  const value = {
    projectId: "p",
    sessionId: "s",
    runId: "r",
    createdAt: "2026-09-20T00:00:00Z",
    model: "m",
    durationMs: 10,
    inputTokens: 2,
    outputTokens: 1,
    cacheReadTokens: 1,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  };
  expect(await store.add(value)).toBe(true);
  expect(await store.add(value)).toBe(false);
  expect(await new UsageStore(root).list()).toEqual([value]);
  expect(
    JSON.parse(await readFile(join(root, "usage.json"), "utf8")).version,
  ).toBe(1);
});
