import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWeekdays, formatDateKey, getWeekStartKey, getWeekEndKey, formatWeekLabel } from "@/lib/weekUtils";
import { dedupeTaskRows } from "@/lib/taskUtils";
import { Loader2, FileText, Copy, Save } from "lucide-react";
import { toast } from "sonner";

interface WeeklyReportGeneratorProps {
  currentWeek: Date;
}

const WeeklyReportGenerator = ({ currentWeek }: WeeklyReportGeneratorProps) => {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    if (!user) return;
    setLoading(true);

    const weekdays = getWeekdays(currentWeek);
    const dates = weekdays.map(formatDateKey);

    const [entriesRes, tasksRes, settingsRes] = await Promise.all([
      supabase
        .from("daily_entries")
        .select("*")
        .eq("user_id", user.id)
        .in("entry_date", dates)
        .order("entry_date"),
      supabase
        .from("daily_tasks")
        .select("task_date, section, task_text, completed")
        .eq("user_id", user.id)
        .in("task_date", dates)
        .order("task_date"),
      supabase
        .from("user_settings")
        .select("email_template")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    try {
      const { data, error } = await supabase.functions.invoke("ai-weekly-report", {
        body: {
          entries: entriesRes.data || [],
          tasks: dedupeTaskRows(tasksRes.data || []),
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
    if (error) {
      toast.error("Failed to save draft");
    } else {
      toast.success("Draft saved");
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(draft);
    toast.success("Copied to clipboard");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" /> Weekly Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!draft && !loading && (
          <Button onClick={generate} className="w-full">
            Generate Weekly Report
          </Button>
        )}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {draft && (
          <>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={16}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button onClick={copyToClipboard} variant="outline" size="sm">
                <Copy className="mr-2 h-4 w-4" /> Copy
              </Button>
              <Button onClick={saveDraft} disabled={saving} size="sm">
                <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save Draft"}
              </Button>
              <Button onClick={generate} variant="ghost" size="sm">
                Regenerate
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WeeklyReportGenerator;
