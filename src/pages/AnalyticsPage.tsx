import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Loader2, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import ThemeToggle from "@/components/ThemeToggle";
import { toast } from "sonner";
import {
  buildSeries, countByGroup, currentStreak, effectiveGroup, filterByRange, isImportant,
  needsClassification, type CompletedTask, type RangeKey,
} from "@/lib/analytics";

const COLORS = Array.from({ length: 12 }, (_, i) => `hsl(var(--chart-${i + 1}))`);
const colorFor = (g: string, i: number) => (g === "Other" || g === "Uncategorized" ? "hsl(var(--muted-foreground))" : COLORS[i % COLORS.length]);
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "1 week" }, { key: "30d", label: "30 days" }, { key: "month", label: "This month" }, { key: "all", label: "All time" },
];

const AnalyticsPage = () => {
  const { user, loading: authLoading } = useAuth() as any;
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<CompletedTask[]>([]);
  const [lockedGroups, setLockedGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [range, setRange] = useState<RangeKey>("30d");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const autoRan = useRef(false);

  const load = useCallback(async () => {
    if (!user) return;
    const all: CompletedTask[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("daily_tasks")
        .select("id, task_text, task_date, group_title, analytics_group")
        .eq("user_id", user.id).eq("completed", true).order("task_date").range(from, from + 999);
      if (error) { toast.error("Couldn't load tasks"); break; }
      all.push(...(data as CompletedTask[]));
      if (!data || data.length < 1000) break;
    }
    const [{ data: open }, { data: custom }] = await Promise.all([
      supabase.from("daily_tasks").select("group_title").eq("user_id", user.id).eq("completed", false).not("group_title", "is", null),
      supabase.from("backlog_groups").select("title").eq("user_id", user.id),
    ]);
    const g = new Set<string>();
    (open ?? []).forEach((r) => r.group_title && g.add(r.group_title));
    (custom ?? []).forEach((r) => g.add(r.title));
    all.forEach((t) => t.task_date >= "2026-10-15" && t.group_title && g.add(t.group_title));
    setLockedGroups([...g]);
    setTasks(all);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const classify = useCallback(async (all: boolean) => {
    const targets = all ? tasks.filter((t) => !(t.task_date >= "2026-10-15" && t.group_title)) : tasks.filter(needsClassification);
    if (!targets.length) { if (all) toast.info("Nothing to reclassify"); return; }
    setClassifying(true);
    try {
      const updated = new Map<string, string>();
      for (let i = 0; i < targets.length; i += 100) {
        const batch = targets.slice(i, i + 100);
        const { data, error } = await supabase.functions.invoke("ai-classify-completed", {
          body: { tasks: batch.map((t) => ({ id: t.id, task_text: t.task_text.replace(/^!! /, "") })), groups: [...lockedGroups, ...new Set(updated.values())] },
        });
        if (error) throw error;
        const a: Record<string, string> = data?.assignments ?? {};
        await Promise.all(Object.entries(a).map(([id, grp]) => {
          updated.set(id, grp);
          return supabase.from("daily_tasks").update({ analytics_group: grp }).eq("id", id);
        }));
      }
      setTasks((prev) => prev.map((t) => (updated.has(t.id) ? { ...t, analytics_group: updated.get(t.id)! } : t)));
      toast.success(`Categorized ${updated.size} tasks`);
    } catch {
      toast.error("Couldn't categorize older tasks");
    } finally { setClassifying(false); }
  }, [tasks, lockedGroups]);

  useEffect(() => {
    if (!loading && !autoRan.current && tasks.some(needsClassification)) { autoRan.current = true; classify(false); }
  }, [loading, tasks, classify]);

  const today = useMemo(() => new Date(), []);
  const inRange = useMemo(() => filterByRange(tasks, range, today), [tasks, range, today]);
  const groupCounts = useMemo(() => countByGroup(inRange), [inRange]);
  const series = useMemo(() => buildSeries(inRange, range, today), [inRange, range, today]);
  const days = new Set(inRange.map((t) => t.task_date));
  const workdays = [...days].filter((d) => { const w = parseISO(d).getDay(); return w > 0 && w < 6; }).length;

  const config: ChartConfig = Object.fromEntries(series.keys.map((k, i) => [k, { label: k, color: colorFor(k, i) }]));
  const barData = groupCounts.slice(0, 12);
  const pieData = series.keys.map((k, i) => ({
    group: k, fill: colorFor(k, i),
    count: k === "Other" ? groupCounts.slice(series.keys.length - 1).reduce((s, c) => s + c.count, 0) : groupCounts.find((c) => c.group === k)?.count ?? 0,
  }));

  if (!authLoading && !user) return <Navigate to="/" replace />;

  const kpis = [
    { label: "Tasks completed", value: inRange.length },
    { label: "Avg per active workday", value: workdays ? (inRange.length / workdays).toFixed(1) : "0" },
    { label: "Most active group", value: groupCounts[0]?.group ?? "—" },
    { label: "Current streak", value: `${currentStreak(tasks.map((t) => t.task_date), today)}d` },
    { label: "Important completed", value: inRange.filter(isImportant).length },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
            <h1 className="text-xl font-bold">Work Analytics</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] space-y-6 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v as RangeKey)} variant="outline">
            {RANGES.map((r) => <ToggleGroupItem key={r.key} value={r.key}>{r.label}</ToggleGroupItem>)}
          </ToggleGroup>
          <Button variant="outline" size="sm" disabled={classifying || loading} onClick={() => classify(true)}>
            {classifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {classifying ? "Categorizing…" : "Reclassify older tasks"}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {kpis.map((k) => (
                <Card key={k.label}><CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="mt-1 truncate text-2xl font-bold" title={String(k.value)}>{k.value}</p>
                </CardContent></Card>
              ))}
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Completions over time {series.weekly && <span className="text-xs font-normal text-muted-foreground">(weekly)</span>}</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer config={config} className="h-[320px] w-full">
                  <LineChart data={series.data}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), "MMM d")} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} />
                    <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => format(parseISO(String(d)), "MMM d, yyyy")} />} />
                    {series.keys.map((k, i) => (
                      <Line key={k} dataKey={k} type="monotone" stroke={colorFor(k, i)} strokeWidth={2} dot={false} hide={hidden.has(k)} />
                    ))}
                  </LineChart>
                </ChartContainer>
                <div className="mt-3 flex flex-wrap gap-2">
                  {series.keys.map((k, i) => (
                    <button key={k} onClick={() => setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                      className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${hidden.has(k) ? "opacity-40" : ""}`}>
                      <span className="h-2 w-2 rounded-full" style={{ background: colorFor(k, i) }} />{k}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <Card>
                <CardHeader><CardTitle className="text-base">By group</CardTitle></CardHeader>
                <CardContent>
                  <ChartContainer config={{ count: { label: "Tasks", color: "hsl(var(--chart-1))" } }} style={{ height: Math.max(200, barData.length * 32) }} className="w-full">
                    <BarChart data={barData} layout="vertical" margin={{ left: 10 }}>
                      <XAxis type="number" allowDecimals={false} hide />
                      <YAxis type="category" dataKey="group" width={150} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" radius={4}>
                        {barData.map((b, i) => <Cell key={b.group} fill={colorFor(b.group, i)} />)}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Share of work</CardTitle></CardHeader>
                <CardContent>
                  <ChartContainer config={config} className="mx-auto h-[280px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="group" />} />
                      <Pie data={pieData} dataKey="count" nameKey="group" innerRadius={60} outerRadius={100}>
                        {pieData.map((p) => <Cell key={p.group} fill={p.fill} />)}
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="group" />} />
                    </PieChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Groups</CardTitle></CardHeader>
              <CardContent className="divide-y p-0">
                {groupCounts.length === 0 && <p className="p-4 text-sm text-muted-foreground">No completed tasks in this range.</p>}
                {groupCounts.map((g) => (
                  <div key={g.group}>
                    <button className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-muted/50" onClick={() => setOpenGroup(openGroup === g.group ? null : g.group)}>
                      <span className="flex items-center gap-2">{openGroup === g.group ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{g.group}</span>
                      <span className="text-muted-foreground">{g.count}</span>
                    </button>
                    {openGroup === g.group && (
                      <ul className="space-y-1 px-10 pb-3 text-sm">
                        {inRange.filter((t) => effectiveGroup(t) === g.group).reverse().map((t) => (
                          <li key={t.id} className="flex justify-between gap-4">
                            <span className={isImportant(t) ? "font-semibold" : ""}>{t.task_text.replace(/^!! /, "")}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{format(parseISO(t.task_date), "MMM d")}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default AnalyticsPage;
