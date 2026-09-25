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

// Plain-text fallback (strip bold/italic/underline/heading/code-fence markers) for
// clients that can't accept a rich HTML clipboard payload.
const toPlainText = (text: string) =>
  text
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/<\/?u>/gi, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[\s(])_(?!_)(.+?)_(?=[\s.,;:)!?]|$)/g, "$1$2")
    .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s.,;:)!?]|$)/g, "$1$2")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .trim();

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const REPORT_SECTION_LABELS = [
  "Completed Tasks",
  "Highlights",
  "Lowlights",
  "Carry-over / Next Week",
];

const normalizeWeeklyReport = (report: string) =>
  report
    .split("\n")
    .map((rawLine) => {
      // Dates are useful to the model for determining task state, but should not
      // appear in the finished email.
      const withoutTaskDate = rawLine.replace(/(\s*[-*]\s+)\[\d{4}-\d{2}-\d{2}\]\s*/g, "$1");
      const plainLine = withoutTaskDate
        .trim()
        .replace(/^#{1,6}\s*/, "")
        .replace(/^\*\*(.*?)\*\*$/, "$1")
        .replace(/^<u>(.*?)<\/u>$/i, "$1")
        .trim();

      const section = REPORT_SECTION_LABELS.find(
        (label) => plainLine.toLowerCase() === label.toLowerCase(),
      );
      if (section) return `**${section}**`;

      if (/^group\s*:/i.test(plainLine)) {
        return `<u>${plainLine}</u>`;
      }

      return withoutTaskDate;
    })
    .join("\n")
    .trim();

// Renders the AI's markdown into inline-styled HTML so pasting into Outlook keeps
// headings/bold/underline/bullets instead of landing as literal asterisks.
const markdownToEmailHtml = (markdown: string): string => {
  const UNDERLINE_OPEN = "@@U_OPEN@@";
  const UNDERLINE_CLOSE = "@@U_CLOSE@@";
  const protectedText = markdown.replace(/<u>/gi, UNDERLINE_OPEN).replace(/<\/u>/gi, UNDERLINE_CLOSE);
  const escaped = escapeHtml(protectedText)
    .split(UNDERLINE_OPEN).join("<u>")
    .split(UNDERLINE_CLOSE).join("</u>");

  const inline = (s: string) =>
    s
      .replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>")
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(^|[\s(])_(?!_)(.+?)_(?=[\s.,;:)!?]|$)/g, "$1<i>$2</i>")
      .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s.,;:)!?]|$)/g, "$1<i>$2</i>");

  const parts: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const tag = listType === "ol" ? "ol" : "ul";
    parts.push(`<${tag} style="margin:4px 0 12px 24px;padding:0;">${listItems.join("")}</${tag}>`);
    listItems = [];
    listType = null;
  };

  for (const rawLine of escaped.split("\n")) {
    const line = rawLine.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (heading) {
      flushList();
      const level = heading[1].length;
      const size = level <= 2 ? "16px" : level === 3 ? "15px" : "14px";
      parts.push(`<p style="margin:16px 0 4px;font-size:${size};font-weight:bold;">${inline(heading[2])}</p>`);
    } else if (bullet) {
      if (listType !== "ul") { flushList(); listType = "ul"; }
      listItems.push(`<li>${inline(bullet[1])}</li>`);
    } else if (numbered) {
      if (listType !== "ol") { flushList(); listType = "ol"; }
      listItems.push(`<li>${inline(numbered[1])}</li>`);
    } else if (line === "") {
      flushList();
    } else {
      flushList();
      parts.push(`<p style="margin:0 0 8px;">${inline(line)}</p>`);
    }
  }
  flushList();

  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1f1f1f;">${parts.join("")}</div>`;
};

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
      supabase.from("daily_tasks").select("id, task_date, section, task_text, completed, group_title").eq("user_id", user.id).in("task_date", dates).eq("completed", true).order("task_date"),
      // Tasks scheduled for THIS week that weren't completed (slipped)
      supabase.from("daily_tasks").select("id, task_date, section, task_text, completed, group_title").eq("user_id", user.id).eq("completed", false).gte("task_date", weekStartKey).lte("task_date", weekEndKey).order("task_date"),
      // Tasks explicitly scheduled for NEXT week (intentional carry-over)
      supabase.from("daily_tasks").select("id, task_date, section, task_text, completed, group_title").eq("user_id", user.id).eq("completed", false).gt("task_date", weekEndKey).lte("task_date", nextWeekEndKey).order("task_date"),
      // Older backlog items (AI will decide what's relevant)
      supabase.from("daily_tasks").select("id, task_date, section, task_text, completed, group_title").eq("user_id", user.id).eq("completed", false).lt("task_date", weekStartKey).order("task_date", { ascending: false }).limit(30),
    ]);

    const completedTasks = dedupeTaskRows(completedTasksRes.data || []);
    const thisWeekPending = dedupeTaskRows(thisWeekPendingRes.data || []);
    const nextWeekPending = dedupeTaskRows(nextWeekPendingRes.data || []);
    const backlogPending = dedupeTaskRows(backlogPendingRes.data || []);

    // For backward-compat with the edge function, pass a flat tasks array too
    const allTasks = dedupeTaskRows([...completedTasks, ...thisWeekPending, ...nextWeekPending, ...backlogPending]);

    // Reuse each task's persisted group_title (the same grouping shown in the
    // Today/Backlog UI) instead of re-asking the AI every time. Only tasks that
    // were never grouped there (most commonly ones completed before the backlog
    // grouping pass ever ran on them) get sent to the AI, and only once — their
    // result then gets merged in alongside the already-grouped tasks.
    interface GroupCandidate { id: string; task_text: string; group_title: string | null }
    const groupCandidates = (dedupeTaskRows([
      ...completedTasks,
      ...thisWeekPending,
      ...nextWeekPending,
      ...backlogPending,
    ]) as GroupCandidate[]).filter((t) => t.id && t.task_text);

    const alreadyGrouped = groupCandidates.filter((t) => !!t.group_title);
    const ungrouped = groupCandidates.filter((t) => !t.group_title);
    const existingGroupTitles = [...new Set(
      alreadyGrouped.map((t) => t.group_title as string).filter((title) => title !== "Other")
    )];

    let newGroups: Array<{ title: string; task_ids: string[] }> = [];
    if (ungrouped.length > 0) {
      try {
        const { data: groupData } = await supabase.functions.invoke("ai-group-tasks", {
          body: {
            tasks: ungrouped.map((t) => ({ id: t.id, task_text: t.task_text })),
            existingGroups: existingGroupTitles,
            maxGroups: Math.max(4, Math.min(10, Math.ceil(groupCandidates.length / 6))),
          },
        });
        if (groupData && Array.isArray(groupData.groups)) newGroups = groupData.groups;
      } catch (e) {
        console.warn("ai-group-tasks failed, continuing without new groupings", e);
      }
    }

    const groupMap = new Map<string, string[]>();
    alreadyGrouped.forEach((t) => {
      const title = t.group_title as string;
      if (!groupMap.has(title)) groupMap.set(title, []);
      groupMap.get(title)!.push(t.id);
    });
    newGroups.forEach((g) => {
      if (!groupMap.has(g.title)) groupMap.set(g.title, []);
      groupMap.get(g.title)!.push(...(g.task_ids || []));
    });
    const placedIds = new Set(newGroups.flatMap((g) => g.task_ids || []));
    ungrouped.forEach((t) => {
      if (!placedIds.has(t.id)) {
        if (!groupMap.has("Other")) groupMap.set("Other", []);
        groupMap.get("Other")!.push(t.id);
      }
    });

    const taskGroups: Array<{ title: string; task_ids: string[] }> =
      [...groupMap.entries()].map(([title, task_ids]) => ({ title, task_ids }));

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
      setDraft(normalizeWeeklyReport(data.report || ""));
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

  const openInOutlook = async () => {
    const lines = draft.split("\n");
    const subjectIdx = lines.findIndex((l) => /^\s*subject\s*:/i.test(l));
    const subject =
      subjectIdx >= 0
        ? lines[subjectIdx].replace(/^\s*subject\s*:\s*/i, "").trim()
        : `Weekly Report — ${formatWeekLabel(currentWeek)}`;
    const body = (subjectIdx >= 0 ? lines.slice(subjectIdx + 1) : lines).join("\n").trim();

    // Open synchronously from the click so browsers do not block the tab while the
    // clipboard operation is running.
    const outlookWindow = window.open("about:blank", "_blank");
    if (outlookWindow) outlookWindow.opener = null;

    // Outlook's compose deeplink only accepts a plain-text body, so the reliable way
    // to land styled (bold/underline/bulleted) content in the email is to put real
    // HTML on the clipboard and have the user paste it into the empty draft.
    let styledCopySucceeded = false;
    try {
      const html = markdownToEmailHtml(body);
      const plain = toPlainText(body);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      styledCopySucceeded = true;
    } catch (e) {
      console.warn("Rich clipboard copy failed, falling back to plain text", e);
    }

    const url = styledCopySucceeded
      ? "https://outlook.office.com/mail/deeplink/compose?subject=" + encodeURIComponent(subject)
      : "https://outlook.office.com/mail/deeplink/compose?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(toPlainText(body));
    if (outlookWindow) {
      outlookWindow.location.href = url;
    } else {
      window.location.href = url;
    }

    if (styledCopySucceeded) {
      toast.success("Styled report copied — paste it (Ctrl/Cmd+V) into the email body");
    } else {
      toast.error("Couldn't copy styled formatting — opened with plain text instead");
    }
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
