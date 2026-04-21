import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { getWeekdays, formatDateKey, getWeekStartKey, getWeekEndKey, formatWeekLabel } from "@/lib/weekUtils";
import { dedupeTaskRows } from "@/lib/taskUtils";
import { Loader2, FileText, Copy, Save, Download } from "lucide-react";
import { toast } from "sonner";

interface WeeklyReportGeneratorProps {
  currentWeek: Date;
}

const WeeklyReportGenerator = ({ currentWeek }: WeeklyReportGeneratorProps) => {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const generate = async () => {
    if (!user) return;
    setLoading(true);

    const weekdays = getWeekdays(currentWeek);
    const dates = weekdays.map(formatDateKey);
    const weekEndKey = getWeekEndKey(currentWeek);

    const [entriesRes, completedTasksRes, pendingTasksRes, settingsRes] = await Promise.all([
      supabase.from("daily_entries").select("*").eq("user_id", user.id).in("entry_date", dates).order("entry_date"),
      supabase.from("daily_tasks").select("task_date, section, task_text, completed").eq("user_id", user.id).in("task_date", dates).eq("completed", true).order("task_date"),
      supabase.from("daily_tasks").select("task_date, section, task_text, completed").eq("user_id", user.id).eq("completed", false).lte("task_date", weekEndKey).order("task_date"),
      supabase.from("user_settings").select("email_template").eq("user_id", user.id).maybeSingle(),
    ]);

    const allTasks = dedupeTaskRows([
      ...(completedTasksRes.data || []),
      ...(pendingTasksRes.data || []),
    ]);

    try {
      const { data, error } = await supabase.functions.invoke("ai-weekly-report", {
        body: {
          entries: entriesRes.data || [],
          tasks: allTasks,
          emailTemplate: settingsRes.data?.email_template || "",
          weekLabel: formatWeekLabel(currentWeek),
        },
      });
      if (error) throw error;
      setDraft(data.report);
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

  const saveDraft = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("weekly_reports").upsert(
      {
        user_id: user.id,
        week_start: getWeekStartKey(currentWeek),
        week_end: getWeekEndKey(currentWeek),
        report_draft: draft,
      },
      { onConflict: "user_id,week_start" }
    );
    setSaving(false);
    if (error) toast.error("Failed to save draft");
    else toast.success("Draft saved");
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Weekly Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={openAndGenerate} className="w-full">
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
              <Button onClick={copyToClipboard} variant="outline" size="sm" disabled={!draft || loading}>
                <Copy className="mr-2 h-4 w-4" /> Copy
              </Button>
              <Button onClick={downloadMarkdown} variant="outline" size="sm" disabled={!draft || loading}>
                <Download className="mr-2 h-4 w-4" /> Download .md
              </Button>
              <Button onClick={generate} variant="ghost" size="sm" disabled={loading}>
                Regenerate
              </Button>
            </div>
            <Button onClick={saveDraft} disabled={saving || !draft || loading} size="sm">
              <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WeeklyReportGenerator;
