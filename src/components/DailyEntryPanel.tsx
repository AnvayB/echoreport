import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import VoiceInput from "./VoiceInput";
import { formatDateKey, formatDayLabel } from "@/lib/weekUtils";
import { toast } from "sonner";
import { Save, Loader2, Sparkles, Pencil } from "lucide-react";

interface DailyEntryPanelProps {
  date: Date;
  onSaved: () => void;
}

const DailyEntryPanel = ({ date, onSaved }: DailyEntryPanelProps) => {
  const { user } = useAuth();
  const [freeText, setFreeText] = useState("");
  const [accomplishments, setAccomplishments] = useState("");
  const [pendingTasks, setPendingTasks] = useState("");
  const [blockers, setBlockers] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [isFirstSave, setIsFirstSave] = useState(true);

  const dateKey = formatDateKey(date);

  // Reset and load when date changes
  useEffect(() => {
    if (!user) return;
    setFreeText("");
    setAccomplishments("");
    setPendingTasks("");
    setBlockers("");
    setNotes("");
    setParsed(false);
    setIsFirstSave(true);
    supabase
      .from("daily_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("entry_date", dateKey)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAccomplishments(data.accomplishments);
          setPendingTasks(data.pending_tasks);
          setBlockers(data.blockers);
          setNotes(data.notes);
          if (data.accomplishments || data.pending_tasks || data.blockers || data.notes) {
            setParsed(true);
            setIsFirstSave(false);
          }
        }
      });
  }, [user, dateKey]);

  const handleParse = async () => {
    if (!freeText.trim()) {
      toast.error("Please enter your update first");
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-parse-entry", {
        body: { text: freeText },
      });
      if (error) throw error;
      setAccomplishments(data.accomplishments || "");
      setPendingTasks(data.pending_tasks || "");
      setBlockers(data.blockers || "");
      setNotes(data.notes || "");
      setParsed(true);
    } catch (e) {
      console.error(e);
      toast.error("Failed to parse entry. You can edit the fields manually.");
      setAccomplishments(freeText);
      setParsed(true);
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("daily_entries").upsert(
      {
        user_id: user.id,
        entry_date: dateKey,
        accomplishments,
        pending_tasks: pendingTasks,
        blockers,
        notes,
      },
      { onConflict: "user_id,entry_date" }
    );
    setSaving(false);
    if (error) {
      toast.error("Failed to save entry");
      console.error(error);
    } else {
      toast.success("Entry saved");
      onSaved();
    }
  };

  const handleEditRaw = () => {
    const combined = [
      accomplishments && `Accomplished: ${accomplishments}`,
      pendingTasks && `Pending: ${pendingTasks}`,
      blockers && `Blockers: ${blockers}`,
      notes && `Notes: ${notes}`,
    ].filter(Boolean).join("\n\n");
    setFreeText(combined);
    setParsed(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Pencil className="h-4 w-4" />
          {formatDayLabel(date)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!parsed ? (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  What did you get done? Any challenges? What's next?
                </p>
                <VoiceInput onTranscript={(t) => setFreeText((prev) => (prev ? prev + " " + t : t))} />
              </div>
              <Textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="Brain-dump everything here — the AI will organize it for you."
                rows={6}
              />
            </div>
            <Button onClick={handleParse} disabled={parsing || !freeText.trim()} className="w-full">
              {parsing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Organizing…</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" /> Organize & Review</>
              )}
            </Button>
          </>
        ) : (
          <>
            {[
              { label: "Accomplishments", value: accomplishments, setter: setAccomplishments },
              { label: "Pending / Tomorrow", value: pendingTasks, setter: setPendingTasks },
              { label: "Blockers", value: blockers, setter: setBlockers },
              { label: "Notes", value: notes, setter: setNotes },
            ].map((f) => (
              <div key={f.label} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <Textarea
                  value={f.value}
                  onChange={(e) => f.setter(e.target.value)}
                  rows={2}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button onClick={handleEditRaw} variant="outline" size="sm">
                Edit raw
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DailyEntryPanel;
