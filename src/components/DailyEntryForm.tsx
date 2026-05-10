import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import VoiceInput from "./VoiceInput";
import { formatDateKey, formatDayLabel } from "@/lib/weekUtils";
import { toast } from "sonner";
import { Save, ArrowLeft, Loader2, Sparkles } from "lucide-react";

interface DailyEntryFormProps {
  date: Date;
  onBack: () => void;
}

const DailyEntryForm = ({ date, onBack }: DailyEntryFormProps) => {
  const { user } = useAuth();
  const [freeText, setFreeText] = useState("");
  const [interimVoiceText, setInterimVoiceText] = useState("");
  const [accomplishments, setAccomplishments] = useState("");
  const [pendingTasks, setPendingTasks] = useState("");
  const [blockers, setBlockers] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const dateKey = formatDateKey(date);

  useEffect(() => {
    if (!user) return;
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
          // If there's existing structured data, show parsed view
          if (data.accomplishments || data.pending_tasks || data.blockers || data.notes) {
            setParsed(true);
          }
        }
        setLoaded(true);
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
      // Fallback: put everything in accomplishments
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
    }
  };

  const handleEditRaw = () => {
    // Go back to free-text mode, pre-fill with structured data
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
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle>{formatDayLabel(date)}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!parsed ? (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  What did you get done today? Any challenges? What's planned for tomorrow?
                </p>
                <VoiceInput
                  onTranscript={(t) => setFreeText((prev) => (prev ? prev + " " + t : t))}
                  onInterimTranscript={setInterimVoiceText}
                />
              </div>
              <Textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="Just brain-dump everything here — what you accomplished, any blockers, what's left for tomorrow. The AI will organize it for you."
                rows={8}
              />
              {interimVoiceText && (
                <p className="text-sm text-muted-foreground italic px-1">{interimVoiceText}</p>
              )}
            </div>
            <Button onClick={handleParse} disabled={parsing || !freeText.trim()} className="w-full">
              {parsing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Organizing your update…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" /> Organize & Review
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Review and edit the organized breakdown, then save.
            </p>
            {[
              { label: "Accomplishments", value: accomplishments, setter: setAccomplishments },
              { label: "Pending / Tomorrow", value: pendingTasks, setter: setPendingTasks },
              { label: "Blockers / Challenges", value: blockers, setter: setBlockers },
              { label: "Notes", value: notes, setter: setNotes },
            ].map((f) => (
              <div key={f.label} className="space-y-1">
                <label className="text-sm font-medium">{f.label}</label>
                <Textarea
                  value={f.value}
                  onChange={(e) => f.setter(e.target.value)}
                  rows={3}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving…" : "Save Entry"}
              </Button>
              <Button onClick={handleEditRaw} variant="outline">
                Edit raw
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DailyEntryForm;
