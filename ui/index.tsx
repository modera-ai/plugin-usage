import { useEffect, useMemo, useState } from "react";
import {
  SettingsPage,
  mountPlugin,
  settingsAction,
  usePluginSnapshot,
} from "@modera/plugin-sdk/react";
import {
  Bot,
  Brain,
  FolderOpen,
  Globe,
  HardDrive,
  Search,
  Terminal,
  Wrench,
} from "lucide-react";

type Mode = "daily" | "weekly" | "cumulative";
interface Day {
  date: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  runs: number;
}
interface Week extends Day {
  periodStart: string;
}
interface Ranked {
  name: string;
  tokens: number;
  runs: number;
}
interface Data {
  totalTokens: number;
  peakTokens: number;
  longestDurationMs: number;
  currentStreak: number;
  longestStreak: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  runs: number;
  sessions: number;
  totalDurationMs: number;
  averageTokens: number;
  cacheHitRate: number;
  busiestHour: number;
  busiestWeekday: number;
  daily: Day[];
  models: Ranked[];
  profiles: Ranked[];
  efforts: { name: string; runs: number }[];
  tools: { owner: string; tool: string; runs: number }[];
}
interface Cell extends Day {
  display: number;
  delay: number;
  column: number;
  row: number;
  filled: boolean;
  periodStart: string;
}
const DAY = 86_400_000;
const COLORS = [
  "#3978f6",
  "#7c5ce5",
  "#18a999",
  "#e49a34",
  "#ef6674",
  "#6c8cae",
];
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const compact = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
const time = (ms: number, zh: boolean) => {
  const minutes = Math.floor(ms / 60_000),
    hours = Math.floor(minutes / 60);
  return hours
    ? zh
      ? `${hours} 小时 ${minutes % 60} 分`
      : `${hours}h ${minutes % 60}m`
    : zh
      ? `${minutes} 分钟`
      : `${minutes}m`;
};
const friendly = (value: string, zh: boolean) => {
  const names: Record<string, readonly [string, string]> = {
    "modera.browser": ["浏览器", "Browser"],
    "modera.instructions": ["指令", "Instructions"],
    "modera.interaction": ["交互", "Interaction"],
    "modera.memory": ["记忆", "Memory"],
    "modera.openers": ["打开方式", "Openers"],
    "modera.search": ["搜索", "Search"],
    "modera.terminal": ["终端", "Terminal"],
    "modera.todo": ["待办", "Todo"],
    "modera.usage": ["用量统计", "Usage"],
    "modera.websearch": ["网络搜索", "Web search"],
    "modera.workspace": ["工作区", "Workspace"],
    "modera.evolution": ["演进", "Evolution"],
    workspace_read: ["读取文件", "Read file"],
    workspace_write: ["写入文件", "Write file"],
    workspace_search: ["搜索文件", "Search files"],
    terminal_execute: ["执行命令", "Execute command"],
    terminal_session: ["终端会话", "Terminal session"],
    browser_create: ["打开网页", "Open page"],
    web_search: ["网络搜索", "Web search"],
  };
  const translated = names[value];
  if (translated) return translated[zh ? 0 : 1];
  return value.replace(/^modera\./, "").replace(/_/g, " ");
};
const effortName = (value: string, zh: boolean) =>
  ({
    none: zh ? "关闭" : "Off",
    minimal: zh ? "最小" : "Minimal",
    low: zh ? "低" : "Low",
    medium: zh ? "中" : "Medium",
    high: zh ? "高" : "High",
    xhigh: zh ? "极高" : "Extra high",
  })[value] ?? friendly(value, zh);
const toolIcon = (owner: string) => {
  if (owner.includes("terminal")) return Terminal;
  if (owner.includes("browser")) return Globe;
  if (owner.includes("workspace")) return FolderOpen;
  if (owner.includes("search")) return Search;
  if (owner.includes("memory")) return Brain;
  if (owner.includes("openers")) return HardDrive;
  return Wrench;
};

function Trend({ days, locale }: { days: Day[]; locale: string }) {
  const [active, setActive] = useState<number>();
  const points = days.slice(-60),
    max = Math.max(1, ...points.map((day) => day.tokens));
  const line = points
    .map(
      (day, index) =>
        `${index ? "L" : "M"}${(index / Math.max(1, points.length - 1)) * 100},${44 - (day.tokens / max) * 38}`,
    )
    .join(" ");
  if (!points.length) return <div className="chart-empty">—</div>;
  return (
    <div className="trend">
      <svg
        viewBox="0 0 100 48"
        preserveAspectRatio="none"
        aria-label="Token trend"
      >
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".28" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L100,48 L0,48 Z`} fill="url(#area)" />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((day, index) => {
          const x = (index / Math.max(1, points.length - 1)) * 100;
          const y = 44 - (day.tokens / max) * 38;
          return (
            <circle
              key={day.date}
              cx={x}
              cy={y}
              r={active === index ? 1.8 : 1.2}
              className="trend-point"
              onPointerEnter={() => setActive(index)}
              onPointerLeave={() => setActive(undefined)}
            />
          );
        })}
      </svg>
      <div>
        <span>{points[0]?.date}</span>
        <b>{compact(max, locale)} max</b>
        <span>{points.at(-1)?.date}</span>
      </div>
      {active !== undefined && points[active] && (
        <div
          className="chart-tooltip"
          style={{
            left: `${Math.min(82, Math.max(4, (active / Math.max(1, points.length - 1)) * 100))}%`,
          }}
        >
          <strong>{points[active].date}</strong>
          <span>{compact(points[active].tokens, locale)} Token</span>
          <small>
            {locale.startsWith("zh") ? "输入" : "Input"}{" "}
            {compact(points[active].inputTokens, locale)} ·{" "}
            {locale.startsWith("zh") ? "输出" : "Output"}{" "}
            {compact(points[active].outputTokens, locale)}
          </small>
        </div>
      )}
    </div>
  );
}

function Donut({
  items,
  total,
  locale,
}: {
  items: Ranked[];
  total: number;
  locale: string;
}) {
  const [active, setActive] = useState<Ranked>();
  const visible = items.slice(0, 6);
  let cursor = 0;
  const stops = items.slice(0, 6).map((item, index) => {
    const from = cursor;
    cursor += total ? (item.tokens / total) * 100 : 0;
    return `${COLORS[index]} ${from}% ${cursor}%`;
  });
  return (
    <div className="donut-wrap">
      <div
        className="donut"
        style={{
          background: stops.length
            ? `conic-gradient(${stops.join(",")})`
            : undefined,
        }}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const angle =
            (Math.atan2(
              event.clientY - (rect.top + rect.height / 2),
              event.clientX - (rect.left + rect.width / 2),
            ) *
              180) /
            Math.PI;
          const percent = ((angle + 450) % 360) / 360;
          let sum = 0;
          setActive(
            visible.find((item) => {
              sum += total ? item.tokens / total : 0;
              return percent <= sum;
            }),
          );
        }}
        onPointerLeave={() => setActive(undefined)}
      >
        <div>
          <strong>{compact(total, locale)}</strong>
          <span>Token</span>
        </div>
      </div>
      <div className="legend">
        {visible.map((item, index) => (
          <div
            key={item.name}
            onPointerEnter={() => setActive(item)}
            onPointerLeave={() => setActive(undefined)}
          >
            <i style={{ background: COLORS[index] }} />
            <span title={item.name}>{item.name}</span>
            <b>{total ? Math.round((item.tokens / total) * 100) : 0}%</b>
          </div>
        ))}
      </div>
      {active && (
        <div className="chart-tooltip donut-tip">
          <strong>{active.name}</strong>
          <span>
            {compact(active.tokens, locale)} Token · {active.runs}{" "}
            {locale.startsWith("zh") ? "次请求" : "requests"}
          </span>
          <small>
            {total ? ((active.tokens / total) * 100).toFixed(1) : 0}%
          </small>
        </div>
      )}
    </div>
  );
}

function UsageSettings() {
  const { snapshot, error } = usePluginSnapshot();
  const [data, setData] = useState<Data>();
  const [mode, setMode] = useState<Mode>("daily");
  const [loading, setLoading] = useState(true);
  const [tip, setTip] = useState<{ cell: Cell; x: number; y: number }>();
  const [hoveredColumn, setHoveredColumn] = useState<number>();
  const locale = snapshot?.locale || "zh-CN",
    zh = locale.startsWith("zh");
  useEffect(() => {
    if (!snapshot) return;
    setLoading(true);
    void settingsAction<Data>("snapshot")
      .then(setData)
      .finally(() => setLoading(false));
  }, [snapshot]);
  const labels = zh
    ? {
        title: "用量统计",
        sub: "了解模型用量、活跃规律与工具偏好",
        total: "累计 Token 数",
        peak: "峰值 Token 数",
        duration: "最长聊天时长",
        current: "当前连续天数",
        longest: "最长连续天数",
        activity: "Token 活动",
        daily: "每日",
        weekly: "每周",
        cumulative: "累计",
        models: "按模型消耗统计",
        trend: "Token 使用趋势",
        insight: "活动洞察",
        tools: "最常用的插件与工具",
        profiles: "API 配置分布",
        efforts: "推理强度偏好",
        sessions: "聊天总数",
        requests: "请求总数",
        average: "平均每次 Token",
        cache: "缓存命中率",
        busy: "最活跃时段",
        input: "输入",
        output: "输出",
        cacheRead: "缓存读取",
        runs: "次请求",
        empty: "完成模型请求后，这里会逐步形成你的使用画像。",
      }
    : {
        title: "Usage statistics",
        sub: "Understand model usage, activity patterns and tool preferences",
        total: "Total tokens",
        peak: "Peak run",
        duration: "Longest chat",
        current: "Current streak",
        longest: "Longest streak",
        activity: "Token activity",
        daily: "Daily",
        weekly: "Weekly",
        cumulative: "Cumulative",
        models: "Usage by model",
        trend: "Token trend",
        insight: "Activity insights",
        tools: "Most-used plugins & tools",
        profiles: "API profile distribution",
        efforts: "Reasoning preference",
        sessions: "Conversations",
        requests: "Requests",
        average: "Average tokens",
        cache: "Cache hit rate",
        busy: "Most active",
        input: "Input",
        output: "Output",
        cacheRead: "Cache read",
        runs: "requests",
        empty: "Complete model requests to build your usage profile.",
      };
  const grid = useMemo(() => {
    const byDate = new Map((data?.daily ?? []).map((day) => [day.date, day]));
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const start = new Date(today.getTime() - 364 * DAY);
    start.setDate(start.getDate() - start.getDay());
    const source: Day[] = [];
    for (let i = 0; i < 371; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const item = byDate.get(dateKey(date)) ?? {
        date: dateKey(date),
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        runs: 0,
      };
      source.push(item);
    }
    const weeks: Week[] = Array.from({ length: 53 }, (_, column) =>
      source.slice(column * 7, column * 7 + 7).reduce<Week>(
        (sum, day) => ({
          date: day.date,
          periodStart: sum.periodStart || day.date,
          tokens: sum.tokens + day.tokens,
          inputTokens: sum.inputTokens + day.inputTokens,
          outputTokens: sum.outputTokens + day.outputTokens,
          runs: sum.runs + day.runs,
        }),
        {
          date: "",
          periodStart: "",
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          runs: 0,
        },
      ),
    );
    if (mode === "cumulative")
      for (let column = 1; column < weeks.length; column++) {
        const previous = weeks[column - 1]!;
        const current = weeks[column]!;
        current.tokens += previous.tokens;
        current.inputTokens += previous.inputTokens;
        current.outputTokens += previous.outputTokens;
        current.runs += previous.runs;
        current.periodStart = weeks[0]!.periodStart;
      }
    const max =
      mode === "daily"
        ? Math.max(0, ...source.map((day) => day.tokens))
        : Math.max(0, ...weeks.map((week) => week.tokens));
    const cells: Cell[] = source.map((day, index) => {
      const column = Math.floor(index / 7);
      const row = index % 7;
      const period = weeks[column]!;
      const display = mode === "daily" ? day.tokens : period.tokens;
      const height =
        display && max ? Math.max(1, Math.ceil((display / max) * 7)) : 0;
      return {
        ...(mode === "daily" ? day : period),
        display,
        column,
        row,
        filled: mode === "daily" ? day.tokens > 0 : row >= 7 - height,
        periodStart: mode === "daily" ? day.date : period.periodStart,
        delay:
          mode === "daily" ? (column + row) * 9 : column * 8 + (6 - row) * 24,
      };
    });
    const months: { label: string; column: number }[] = [];
    let last = -1;
    let lastColumn = -10;
    cells.forEach((cell, index) => {
      const month = new Date(`${cell.date}T12:00:00`).getMonth();
      if (month !== last) {
        const column = Math.floor(index / 7);
        if (column - lastColumn >= 5) {
          months.push({
            label: new Intl.DateTimeFormat(
              locale,
              index === 0
                ? { month: "short", day: "numeric" }
                : { month: "short" },
            ).format(new Date(`${cell.date}T12:00:00`)),
            column,
          });
          lastColumn = column;
        }
        last = month;
      }
    });
    return { cells, months, max };
  }, [data?.daily, locale, mode]);
  const weekday =
    data && data.busiestWeekday >= 0
      ? new Intl.DateTimeFormat(locale, { weekday: "long" }).format(
          new Date(2026, 8, 20 + data.busiestWeekday),
        )
      : "—";
  const metrics = data
    ? [
        [compact(data.totalTokens, locale), labels.total],
        [compact(data.peakTokens, locale), labels.peak],
        [time(data.longestDurationMs, zh), labels.duration],
        [`${data.currentStreak} ${zh ? "天" : "days"}`, labels.current],
        [`${data.longestStreak} ${zh ? "天" : "days"}`, labels.longest],
      ]
    : [];
  return (
    <SettingsPage title={labels.title}>
      <div className="usage-page">
        <p className="subtitle">{labels.sub}</p>
        {error && <p role="alert">{error}</p>}
        {loading && !data ? (
          <div className="loading">{zh ? "正在汇总…" : "Loading…"}</div>
        ) : (
          data && (
            <>
              <section className="summary">
                {metrics.map(([value, label]) => (
                  <div className="metric" key={label}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </section>
              <div className="token-strip">
                <span>
                  {labels.input} <b>{compact(data.inputTokens, locale)}</b>
                </span>
                <span>
                  {labels.output} <b>{compact(data.outputTokens, locale)}</b>
                </span>
                <span>
                  {labels.cacheRead}{" "}
                  <b>{compact(data.cacheReadTokens, locale)}</b>
                </span>
                <span>
                  {data.runs.toLocaleString(locale)} {labels.runs}
                </span>
              </div>
              <section className="card activity-card">
                <header>
                  <h3>{labels.activity}</h3>
                  <nav>
                    {(["daily", "weekly", "cumulative"] as Mode[]).map(
                      (value) => (
                        <button
                          className={mode === value ? "active" : ""}
                          onClick={() => setMode(value)}
                          key={value}
                        >
                          {labels[value]}
                        </button>
                      ),
                    )}
                  </nav>
                </header>
                {data.daily.length ? (
                  <div className="heatmap-wrap" key={mode}>
                    <div className="month-row">
                      {grid.months.map((item) => (
                        <span
                          key={`${item.label}-${item.column}`}
                          style={{ gridColumnStart: item.column + 1 }}
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                    <div className="heatmap">
                      {grid.cells.map((cell) => {
                        const ratio = grid.max ? cell.display / grid.max : 0,
                          level = !cell.filled
                            ? 0
                            : ratio > 0.72
                              ? 4
                              : ratio > 0.42
                                ? 3
                                : ratio > 0.18
                                  ? 2
                                  : 1;
                        return (
                          <div
                            className={`cell l${level}${mode !== "daily" ? " histogram" : ""}${hoveredColumn === cell.column && mode !== "daily" ? " column-hover" : ""}`}
                            key={`${cell.date}-${cell.row}`}
                            style={{ animationDelay: `${cell.delay}ms` }}
                            onPointerEnter={(event) => {
                              setHoveredColumn(cell.column);
                              setTip({
                                cell,
                                x: event.clientX,
                                y: event.clientY,
                              });
                            }}
                            onPointerMove={(event) =>
                              setTip({
                                cell,
                                x: event.clientX,
                                y: event.clientY,
                              })
                            }
                            onPointerLeave={() => {
                              setTip(undefined);
                              setHoveredColumn(undefined);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="empty">{labels.empty}</div>
                )}
              </section>
              <div className="chart-grid">
                <section className="card">
                  <header>
                    <h3>{labels.models}</h3>
                  </header>
                  <Donut
                    items={data.models}
                    total={data.totalTokens}
                    locale={locale}
                  />
                </section>
                <section className="card">
                  <header>
                    <h3>{labels.trend}</h3>
                  </header>
                  <Trend days={data.daily} locale={locale} />
                </section>
              </div>
              <div className="detail-grid">
                <section className="card">
                  <header>
                    <h3>{labels.insight}</h3>
                  </header>
                  <dl className="insights">
                    <div>
                      <dt>{labels.sessions}</dt>
                      <dd>{data.sessions}</dd>
                    </div>
                    <div>
                      <dt>{labels.requests}</dt>
                      <dd>{data.runs}</dd>
                    </div>
                    <div>
                      <dt>{labels.average}</dt>
                      <dd>{compact(data.averageTokens, locale)}</dd>
                    </div>
                    <div>
                      <dt>{labels.cache}</dt>
                      <dd>{Math.round(data.cacheHitRate * 100)}%</dd>
                    </div>
                    <div>
                      <dt>{labels.busy}</dt>
                      <dd>
                        {data.busiestHour < 0
                          ? "—"
                          : `${weekday} · ${String(data.busiestHour).padStart(2, "0")}:00`}
                      </dd>
                    </div>
                  </dl>
                </section>
                <section className="card">
                  <header>
                    <h3>{labels.tools}</h3>
                  </header>
                  <div className="rank-list">
                    {data.tools.slice(0, 6).map((item) => {
                      const Icon = toolIcon(item.owner);
                      return (
                        <div
                          key={`${item.owner}-${item.tool}`}
                          title={`${friendly(item.owner, zh)} · ${friendly(item.tool, zh)} · ${item.runs} ${labels.runs}`}
                        >
                          <i className="tool-rank-icon">
                            <Icon size={15} />
                          </i>
                          <span>
                            <b>{friendly(item.owner, zh)}</b>
                            <small>{friendly(item.tool, zh)}</small>
                          </span>
                          <strong>{item.runs}×</strong>
                        </div>
                      );
                    })}
                    {!data.tools.length && <p className="muted">—</p>}
                  </div>
                </section>
              </div>
              <div className="detail-grid">
                <section className="card">
                  <header>
                    <h3>{labels.profiles}</h3>
                  </header>
                  <div className="bars">
                    {data.profiles.slice(0, 6).map((item) => {
                      const legacyId = /^[0-9a-f-]{16,}$/i.test(item.name);
                      const displayName = legacyId
                        ? `${zh ? "历史配置" : "Legacy profile"} · ${item.name.slice(0, 6)}`
                        : item.name === "default"
                          ? zh
                            ? "默认配置"
                            : "Default profile"
                          : item.name;
                      return (
                        <div
                          key={item.name}
                          title={`${displayName} · ${compact(item.tokens, locale)} Token · ${item.runs} ${labels.runs}`}
                        >
                          <span>
                            <Bot size={13} /> {displayName}
                          </span>
                          <div>
                            <i
                              style={{
                                width: `${data.totalTokens ? (item.tokens / data.totalTokens) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <b>{compact(item.tokens, locale)}</b>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <section className="card">
                  <header>
                    <h3>{labels.efforts}</h3>
                  </header>
                  <div className="efforts">
                    {data.efforts.map((item, index) => (
                      <div
                        key={item.name}
                        title={`${friendly(item.name, zh)} · ${item.runs} ${labels.runs} · ${Math.round(data.runs ? (item.runs / data.runs) * 100 : 0)}%`}
                        style={
                          {
                            "--share": `${data.runs ? (item.runs / data.runs) * 100 : 0}%`,
                            "--color": COLORS[index % COLORS.length],
                          } as React.CSSProperties
                        }
                      >
                        <span>{effortName(item.name, zh)}</span>
                        <b>
                          {Math.round(
                            data.runs ? (item.runs / data.runs) * 100 : 0,
                          )}
                          %
                        </b>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <p className="footnote">
                {zh
                  ? "仅统计服务端返回的 usage；缓存量属于输入量，不重复计入总数。新增分析维度从升级后的请求开始记录。"
                  : "Provider-reported usage only; cache is a subset of input. New dimensions accumulate after this update."}
              </p>
            </>
          )
        )}
      </div>
      {tip && (
        <div
          className="tooltip"
          style={{
            left: Math.min(tip.x + 14, window.innerWidth - 230),
            top: Math.max(8, tip.y - 74),
          }}
        >
          <strong>
            {mode === "daily"
              ? new Intl.DateTimeFormat(locale, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }).format(new Date(`${tip.cell.date}T12:00:00`))
              : mode === "weekly"
                ? `${tip.cell.periodStart} — ${tip.cell.date}`
                : `${zh ? "截至" : "Through"} ${tip.cell.date}`}
          </strong>
          <span>
            {compact(tip.cell.tokens, locale)} Token · {tip.cell.runs}{" "}
            {labels.runs}
          </span>
          <small>
            {labels.input} {compact(tip.cell.inputTokens, locale)} ·{" "}
            {labels.output} {compact(tip.cell.outputTokens, locale)}
          </small>
        </div>
      )}
    </SettingsPage>
  );
}
mountPlugin(<UsageSettings />);
