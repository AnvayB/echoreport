import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { getWeekdays, formatDateKey, getWeekStartKey, getWeekEndKey, formatWeekLabel } from "@/lib/weekUtils";
import { dedupeTaskRows } from "@/lib/taskUtils";
import { Loader2, FileText, Copy, Download, Mail } from "lucide-react";
import { toast } from "sonner";

// Strip markdown remnants (bold/italic markers, heading hashes, code fences)
// so the draft can be pasted straight into Outlook and styled there.
const stripMarkdown = (text: string) =>
  text
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[\s(])_(?!_)(.+?)_(?=[\s.,;:)!?]|$)/g, "$1$2")
    .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s.,;:)!?]|$)/g, "$1$2")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .trim();

interface WeeklyReportGeneratorProps {
  currentWeek: Date;
}

interface ReportTemplate {
  id: string;
  name: string;
  template: string;
  is_default: boolean;
}

const WeeklyReportGenerator = ({ currentWeek }: WeeklyReportGeneratorProps) => {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("report_templates")
      .select("id, name, template, is_default")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const list = (data ?? []) as ReportTemplate[];
        setTemplates(list);
        const def = list.find((t) => t.is_default) ?? list[0];
        if (def) setSelectedTemplateId(def.id);
      });
  }, [user]);

  const generate = async () => {
    if (!user) return;
    setLoading(true);

    const weekdays = getWeekdays(currentWeek);
    // Include the prior Saturday and Sunday so weekend work rolls into this week's report.
    const mondayDate = weekdays[0];
    const priorSaturday = new Date(mondayDate);
    priorSaturday.setDate(priorSaturday.getDate() - 2);
    const priorSunday = new Date(mondayDate);
    priorSunday.setDate(priorSunday.getDate() - 1);
    const scopeDates = [priorSaturday, priorSunday, ...weekdays];
    const dates = scopeDates.map(formatDateKey);
    const weekEndKey = getWeekEndKey(currentWeek);

    // Start the week's query range at the prior Saturday so weekend tasks are included.
    const weekStartKey = formatDateKey(priorSaturday);
    // Next workweek: Mon–Fri after weekEndKey
    const nextWeekStart = new Date(currentWeek);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7 - nextWeekStart.getDay() + 1);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 4);
    const nextWeekEndKey = formatDateKey(nextWeekEnd);

    const [entriesRes, completedTasksRes, thisWeekPendingRes, nextWeekPendingRes, backlogPendingRes] = await Promise.all([
      supabase.from("daily_entries").select("*").eq("user_id", user.id).in("entry_date", dates).order("entry_date"),
      supabase.from("daily_tasks").select("id, task_date, section, task_text, completed").eq("user_id", user.id).in("task_date", dates).eq("completed", true).order("task_date"),
      // Tasks scheduled for THIS week that weren't completed (slipped)
      supabase.from("daily_tasks").select("id, task_date, section, task_text, completed").eq("user_id", user.id).eq("completed", false).gte("task_date", weekStartKey).lte("task_date", weekEndKey).order("task_date"),
      // Tasks explicitly scheduled for NEXT week (intentional carry-over)
      supabase.from("daily_tasks").select("id, task_date, section, task_text, completed").eq("user_id", user.id).eq("completed", false).gt("task_date", weekEndKey).lte("task_date", nextWeekEndKey).order("task_date"),
      // Older backlog items (AI will decide what's relevant)
      supabase.from("daily_tasks").select("id, task_date, section, task_text, completed").eq("user_id", user.id).eq("completed", false).lt("task_date", weekStartKey).order("task_date", { ascending: false }).limit(30),
    ]);

    const completedTasks = dedupeTaskRows(completedTasksRes.data || []);
    const thisWeekPending = dedupeTaskRows(thisWeekPendingRes.data || []);
    const nextWeekPending = dedupeTaskRows(nextWeekPendingRes.data || []);
    const backlogPending = dedupeTaskRows(backlogPendingRes.data || []);

    // For backward-compat with the edge function, pass a flat tasks array too
    const allTasks = dedupeTaskRows([...completedTasks, ...thisWeekPending, ...nextWeekPending, ...backlogPending]);

    // Ask the grouping function to organize the union of completed + carry-over
    // (slipped + planned-next-week + backlog) into the same project buckets shown
    // in the Today/Backlog UI, so the weekly report reuses those groupings.
    const groupInput = dedupeTaskRows([
      ...completedTasks,
      ...thisWeekPending,
      ...nextWeekPending,
      ...backlogPending,
    ])
      .filter((t: any) => t.id && t.task_text)
      .map((t: any) => ({ id: t.id as string, task_text: t.task_text as string }));

    let taskGroups: Array<{ title: string; task_ids: string[] }> = [];
    try {
      const { data: groupData } = await supabase.functions.invoke("ai-group-tasks", {
        body: { tasks: groupInput },
      });
      if (groupData && Array.isArray(groupData.groups)) taskGroups = groupData.groups;
    } catch (e) {
      console.warn("ai-group-tasks failed, continuing without groupings", e);
    }

    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

    try {
      const { data, error } = await supabase.functions.invoke("ai-weekly-report", {
        body: {
          entries: entriesRes.data || [],
          tasks: allTasks,
          thisWeekPending,
          nextWeekPending,
          backlogPending,
          taskGroups,
          emailTemplate: selectedTemplate?.template || "",
          weekLabel: formatWeekLabel(currentWeek),
        },
      });
      if (error) throw error;
      setDraft(stripMarkdown(data.report || ""));
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const openAndGenerate = async () => {
    setOpen(true);
    if (!draft) await generate();
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(draft);
    toast.success("Copied to clipboard");
  };

  const downloadMarkdown = () => {
    const blob = new Blob([draft], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-report-${getWeekStartKey(currentWeek)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  };

  const openInOutlook = () => {
    const lines = draft.split("\n");
    const subjectIdx = lines.findIndex((l) => /^\s*subject\s*:/i.test(l));
    const subject =
      subjectIdx >= 0
        ? lines[subjectIdx].replace(/^\s*subject\s*:\s*/i, "").trim()
        : `Weekly Report — ${formatWeekLabel(currentWeek)}`;
    const body = (subjectIdx >= 0 ? lines.slice(subjectIdx + 1) : lines).join("\n").trim();
    const url =
      "https://outlook.office.com/mail/deeplink/compose?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Weekly Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {templates.length > 1 && (
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{t.is_default ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={openAndGenerate} className="w-full" disabled={!selectedTemplateId}>
            Generate Weekly Report
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Weekly Report — {formatWeekLabel(currentWeek)}</DialogTitle>
          </DialogHeader>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && draft && (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={20}
              autoResize={false}
              className="font-mono text-sm min-h-[400px]"
            />
          )}
          <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button onClick={downloadMarkdown} variant="outline" size="sm" disabled={!draft || loading}>
                <Download className="mr-2 h-4 w-4" /> Download .md
              </Button>
              <Button onClick={openInOutlook} variant="outline" size="sm" disabled={!draft || loading}>
                <Mail className="mr-2 h-4 w-4" /> Open in Outlook Web
              </Button>
              <Button onClick={generate} variant="ghost" size="sm" disabled={loading}>
                Regenerate
              </Button>
            </div>
            <Button onClick={copyToClipboard} disabled={!draft || loading} size="sm">
              <Copy className="mr-2 h-4 w-4" /> Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WeeklyReportGenerator;
