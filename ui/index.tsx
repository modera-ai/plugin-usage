import { useCallback, useEffect, useMemo, useState } from "react";
import { CaretLeftIcon as ChevronLeft } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon as ChevronRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { ArrowsClockwiseIcon as RefreshCw } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { AreaChart, BarChart, Button, ColumnChart, DialogNotice, DonutChart, Tabs, TabsList, TabsTrigger, UiProvider, UsageRankList, UsageStat } from "@pal/ui";
import { TokenActivity } from "@pal/ui/agent";
import { SettingsPage } from "@pal/ui/settings";
import "@pal/ui/styles.css";
import "./usage-extra.css";
import { frontend, mountPlugin, usePluginSnapshot } from "@pal/plugin-sdk/react";

interface Day { date: string; tokens: number; inputTokens: number; outputTokens: number; runs: number }
interface Ranked { name: string; tokens: number; runs: number }
interface Data {
  totalTokens: number; peakTokens: number; longestDurationMs: number; currentStreak: number; longestStreak: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; reasoningTokens: number;
  runs: number; sessions: number; totalDurationMs: number; averageTokens: number; cacheHitRate: number;
  busiestHour: number; busiestWeekday: number; daily: Day[]; models: Ranked[]; profiles: Ranked[];
  efforts: { name: string; runs: number }[]; tools: { owner: string; tool: string; runs: number }[];
}
const compact = (value: number, locale: string) => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
const friendly = (value: string, zh: boolean) => {
  const names: Record<string, [string, string]> = {
    "modera.browser": ["浏览器", "Browser"], "modera.terminal": ["终端", "Terminal"], "modera.websearch": ["网络搜索", "Web search"],
    "modera.filesystem": ["文件系统", "Filesystem"], "modera.memory": ["记忆", "Memory"], "modera.openers": ["打开方式", "Openers"],
    "modera.instructions": ["指令", "Instructions"], "modera.interaction": ["交互", "Interaction"], "modera.todo": ["待办", "Todo"],
    filesystem_read: ["读取文件", "Read file"], workspace_write: ["写入文件", "Write file"], workspace_search: ["搜索文件", "Search files"],
    terminal_execute: ["执行命令", "Execute command"], terminal_session: ["终端会话", "Terminal session"], browser_create: ["打开网页", "Open page"], web_search: ["网络搜索", "Web search"],
  };
  return names[value]?.[zh ? 0 : 1] ?? value.replace(/^modera\./, "").replace(/_/g, " ");
};
const effortName = (value: string, zh: boolean) => ({
  none: zh ? "关闭" : "Off", minimal: zh ? "最小" : "Minimal", low: zh ? "低" : "Low",
  medium: zh ? "中" : "Medium", high: zh ? "高" : "High", xhigh: zh ? "极高" : "Extra high",
})[value] ?? friendly(value, zh);
const profileName = (name: string, zh: boolean) => /^[0-9a-f-]{16,}$/i.test(name)
  ? `${zh ? "历史配置" : "Legacy profile"} · ${name.slice(0, 6)}`
  : name === "default" ? (zh ? "默认配置" : "Default profile") : name;
const time = (ms: number, zh: boolean) => {
  const minutes = Math.floor(ms / 60000), hours = Math.floor(minutes / 60);
  return hours ? zh ? `${hours} 小时 ${minutes % 60} 分` : `${hours}h ${minutes % 60}m` : zh ? `${minutes} 分钟` : `${minutes}m`;
};
function UsageSettings() {
  const { snapshot, error } = usePluginSnapshot();
  const [data, setData] = useState<Data>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [range, setRange] = useState<7 | 30 | 90 | 365>(30);
  const [modelPage, setModelPage] = useState(0);
  const locale = snapshot?.locale || "zh-CN", zh = locale.startsWith("zh");
  const t = (a: string, b: string) => zh ? a : b;
  const refresh = useCallback(async () => {
    setLoading(true); setLoadError("");
    try { setData(await frontend().settings!.commands!.execute<Data>("pal.usage.snapshot", {})); }
    catch (cause) { setLoadError(String(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void frontend().ready().catch(() => {}); }, []);
  useEffect(() => { if (snapshot) void refresh(); }, [snapshot, refresh]);
  const days = useMemo(() => data?.daily.slice(-range) ?? [], [data?.daily, range]);
  const visibleModels = data?.models.slice(modelPage * 10, modelPage * 10 + 10) ?? [];
  const modelPages = Math.max(1, Math.ceil((data?.models.length ?? 0) / 10));
  const busiestDay = data && data.busiestWeekday >= 0
    ? new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2026, 8, 20 + data.busiestWeekday)) : "—";
  return <UiProvider theme={snapshot?.theme?.mode ?? "system"} locale={zh ? "zh-CN" : "en"} className="usage-settings-ui mu-settings-codex">
    <SettingsPage title={t("用量统计", "Usage statistics")} description={t("跟踪真实的 Token 用量、缓存和请求汇总。", "Track real token usage, cache activity and request totals.")} actions={<Button variant="outline" size="small" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15} />{t("刷新", "Refresh")}</Button>}>
      <div className="usage-range"><Tabs variant="quiet" value={String(range)} onValueChange={(value) => setRange(Number(value) as 7 | 30 | 90 | 365)}><TabsList aria-label={t("趋势日期范围", "Trend date range")}>{([7, 30, 90, 365] as const).map((value) => <TabsTrigger key={value} value={String(value)}>{value === 365 ? t("全年", "Year") : t(`近 ${value} 天`, `Last ${value} days`)}</TabsTrigger>)}</TabsList></Tabs></div>
      {error && <DialogNotice tone="error">{error}</DialogNotice>}
      {loadError && <DialogNotice tone="error">{loadError}</DialogNotice>}
      {loading && !data && <DialogNotice>{t("正在汇总…", "Loading…")}</DialogNotice>}
      {data && <>
        <div className="usage-stats">
          <UsageStat label={t("累计 Token", "Total tokens")} value={compact(data.totalTokens, locale)} />
          <UsageStat label={t("输入 Token", "Input tokens")} value={compact(data.inputTokens, locale)} />
          <UsageStat label={t("输出 Token", "Output tokens")} value={compact(data.outputTokens, locale)} />
          <UsageStat label={t("缓存写入", "Cache write")} value={compact(data.cacheWriteTokens, locale)} />
          <UsageStat label={t("缓存读取", "Cache read")} value={compact(data.cacheReadTokens, locale)} />
          <UsageStat label={t("请求总数", "Total requests")} value={data.runs.toLocaleString(locale)} />
          <UsageStat label={t("缓存命中率", "Cache hit rate")} value={`${Math.round(data.cacheHitRate * 100)}%`} />
          <UsageStat label={t("峰值 Token", "Peak tokens")} value={compact(data.peakTokens, locale)} />
        </div>
        <TokenActivity days={data.daily} endDate={new Date().toISOString().slice(0, 10)} />
        <div className="usage-charts">
          <section><h2>{t("按模型消耗统计", "Usage by model")}</h2><DonutChart data={data.models.map((item) => ({ label: item.name, value: item.tokens }))} centerLabel={t("总 Token", "Total tokens")} emptyLabel={t("暂无数据", "No data")} /></section>
          <section><h2>{t("Token 使用趋势", "Token usage trend")}</h2><AreaChart data={days.map((day) => ({ label: day.date, value: day.tokens, detail: `${t("输入", "Input")} ${compact(day.inputTokens, locale)} · ${t("输出", "Output")} ${compact(day.outputTokens, locale)}` }))} unit="Token" emptyLabel={t("暂无数据", "No data")} /></section>
        </div>
        <div className="usage-details">
          <section><h2>{t("活动洞察", "Activity insights")}</h2><dl>
            <div><dt>{t("会话数", "Sessions")}</dt><dd>{data.sessions}</dd></div>
            <div><dt>{t("平均每次 Token", "Average tokens")}</dt><dd>{compact(data.averageTokens, locale)}</dd></div>
            <div><dt>{t("最长聊天时长", "Longest chat")}</dt><dd>{time(data.longestDurationMs, zh)}</dd></div>
            <div><dt>{t("当前连续天数", "Current streak")}</dt><dd>{data.currentStreak}</dd></div>
            <div><dt>{t("最长连续天数", "Longest streak")}</dt><dd>{data.longestStreak}</dd></div>
            <div><dt>{t("最活跃时段", "Busiest hour")}</dt><dd>{data.busiestHour < 0 ? "—" : `${busiestDay} · ${String(data.busiestHour).padStart(2, "0")}:00`}</dd></div>
          </dl></section>
          <section><h2>{t("最常用的插件与工具", "Most-used plugins & tools")}</h2><UsageRankList data={data.tools.slice(0, 6).map((item) => ({ name: friendly(item.owner, zh), detail: friendly(item.tool, zh), value: `${item.runs}×` }))} /></section>
          <section><h2>{t("API 配置分布", "API profile distribution")}</h2><BarChart data={data.profiles.slice(0, 6).map((item) => ({ label: profileName(item.name, zh), value: item.tokens }))} emptyLabel={t("暂无数据", "No data")} /></section>
          <section><h2>{t("推理强度偏好", "Reasoning preference")}</h2><ColumnChart data={data.efforts.map((item) => ({ label: effortName(item.name, zh), value: item.runs }))} emptyLabel={t("暂无数据", "No data")} /></section>
        </div>
        <section className="usage-models"><header><h2>{t("模型用量", "Model usage")}</h2><p>{t("按模型统计真实 Token 消耗与请求数。", "Actual token use and request count by model.")}</p></header><div className="usage-table-scroll"><table><thead><tr><th>{t("模型", "Model")}</th><th>{t("请求", "Requests")}</th><th>{t("总量", "Total")}</th></tr></thead><tbody>{visibleModels.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.runs.toLocaleString(locale)}</td><td>{compact(item.tokens, locale)}</td></tr>)}</tbody></table></div>{!data.models.length && <p>{t("暂无数据", "No data")}</p>}{modelPages > 1 && <footer><Button size="icon" variant="quiet" aria-label={t("上一页", "Previous page")} disabled={modelPage === 0} onClick={() => setModelPage((page) => page - 1)}><ChevronLeft size={16} /></Button><span>{modelPage + 1} / {modelPages}</span><Button size="icon" variant="quiet" aria-label={t("下一页", "Next page")} disabled={modelPage + 1 >= modelPages} onClick={() => setModelPage((page) => page + 1)}><ChevronRight size={16} /></Button></footer>}</section>
        <p className="usage-footnote">{t("仅统计服务端返回的 usage；缓存量属于输入量，不重复计入总数。新增分析维度从升级后的请求开始记录。", "Provider-reported usage only; cache is a subset of input. New dimensions accumulate after this update.")}</p>
      </>}
    </SettingsPage>
  </UiProvider>;
}
mountPlugin(<UsageSettings />);

