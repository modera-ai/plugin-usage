export interface UsageRecord {
  projectId: string;
  sessionId: string;
  runId: string;
  createdAt: string;
  model: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  profileId?: string;
  profileName?: string;
  reasoningEffort?: string;
  tools?: { owner: string; tool: string }[];
}
export interface DailyUsage {
  date: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  runs: number;
}

const dayKey = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const ranked = <T extends { tokens: number }>(values: Iterable<T>): T[] =>
  [...values].sort((a, b) => b.tokens - a.tokens);

export function aggregate(records: readonly UsageRecord[], now = new Date()) {
  const daily = new Map<string, DailyUsage>();
  const models = new Map<
    string,
    { name: string; tokens: number; runs: number }
  >();
  const profiles = new Map<
    string,
    { name: string; tokens: number; runs: number }
  >();
  const efforts = new Map<string, number>();
  const tools = new Map<
    string,
    { owner: string; tool: string; runs: number }
  >();
  const sessions = new Set<string>();
  const hours = Array.from({ length: 24 }, () => 0);
  const weekdays = Array.from({ length: 7 }, () => 0);
  let totalTokens = 0,
    peakTokens = 0,
    longestDurationMs = 0,
    totalDurationMs = 0;
  let inputTokens = 0,
    outputTokens = 0,
    cacheReadTokens = 0,
    cacheWriteTokens = 0,
    reasoningTokens = 0;
  for (const record of records) {
    const tokens = record.inputTokens + record.outputTokens;
    totalTokens += tokens;
    peakTokens = Math.max(peakTokens, tokens);
    longestDurationMs = Math.max(longestDurationMs, record.durationMs);
    totalDurationMs += record.durationMs;
    inputTokens += record.inputTokens;
    outputTokens += record.outputTokens;
    cacheReadTokens += record.cacheReadTokens;
    cacheWriteTokens += record.cacheWriteTokens;
    reasoningTokens += record.reasoningTokens;
    sessions.add(`${record.projectId}:${record.sessionId}`);
    const instant = new Date(record.createdAt);
    if (!Number.isNaN(instant.getTime())) {
      hours[instant.getHours()]! += tokens;
      weekdays[instant.getDay()]! += tokens;
    }
    const model = models.get(record.model) ?? {
      name: record.model,
      tokens: 0,
      runs: 0,
    };
    model.tokens += tokens;
    model.runs += 1;
    models.set(record.model, model);
    const profileName = record.profileName || record.profileId || "default";
    const profile = profiles.get(profileName) ?? {
      name: profileName,
      tokens: 0,
      runs: 0,
    };
    profile.tokens += tokens;
    profile.runs += 1;
    profiles.set(profileName, profile);
    const effort = record.reasoningEffort || "unknown";
    efforts.set(effort, (efforts.get(effort) ?? 0) + 1);
    for (const tool of record.tools ?? []) {
      const id = `${tool.owner}:${tool.tool}`;
      const current = tools.get(id) ?? { ...tool, runs: 0 };
      current.runs += 1;
      tools.set(id, current);
    }
    const date = dayKey(record.createdAt);
    const current = daily.get(date) ?? {
      date,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      runs: 0,
    };
    current.tokens += tokens;
    current.inputTokens += record.inputTokens;
    current.outputTokens += record.outputTokens;
    current.runs += 1;
    daily.set(date, current);
  }
  const activeDays = [...daily.keys()].sort();
  let longestStreak = 0,
    streak = 0,
    previous = "";
  for (const date of activeDays) {
    const prior = new Date(`${date}T12:00:00`);
    prior.setDate(prior.getDate() - 1);
    streak = previous === dayKey(prior.toISOString()) ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
    previous = date;
  }
  const today = dayKey(now.toISOString());
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const latest = activeDays.at(-1);
  let currentStreak = 0;
  if (latest === today || latest === dayKey(yesterday.toISOString())) {
    currentStreak = 1;
    const cursor = new Date(`${latest}T12:00:00`);
    for (let i = activeDays.length - 2; i >= 0; i--) {
      cursor.setDate(cursor.getDate() - 1);
      if (activeDays[i] !== dayKey(cursor.toISOString())) break;
      currentStreak += 1;
    }
  }
  return {
    totalTokens,
    peakTokens,
    longestDurationMs,
    currentStreak,
    longestStreak,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    runs: records.length,
    sessions: sessions.size,
    totalDurationMs,
    averageTokens: records.length
      ? Math.round(totalTokens / records.length)
      : 0,
    cacheHitRate: inputTokens ? Math.min(1, cacheReadTokens / inputTokens) : 0,
    busiestHour: totalTokens ? hours.indexOf(Math.max(...hours)) : -1,
    busiestWeekday: totalTokens ? weekdays.indexOf(Math.max(...weekdays)) : -1,
    models: ranked(models.values()),
    profiles: ranked(profiles.values()),
    efforts: [...efforts]
      .map(([name, runs]) => ({ name, runs }))
      .sort((a, b) => b.runs - a.runs),
    tools: [...tools.values()].sort((a, b) => b.runs - a.runs),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
