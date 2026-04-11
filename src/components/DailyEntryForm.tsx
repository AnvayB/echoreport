import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import VoiceInput from "./VoiceInput";
import { formatDateKey, formatDayLabel } from "@/lib/weekUtils";
import { toast } from "sonner";
import { Save, ArrowLeft } from "lucide-react";

interface DailyEntryFormProps {
  date: Date;
  onBack: () => void;
}

const DailyEntryForm = ({ date, onBack }: DailyEntryFormProps) => {
  const { user } = useAuth();
  const [accomplishments, setAccomplishments] = useState("");
  const [pendingTasks, setPendingTasks] = useState("");
  const [blockers, setBlockers] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
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
        }
        setLoaded(true);
      });
  }, [user, dateKey]);

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

  const fields = [
    { label: "Accomplishments", value: accomplishments, setter: setAccomplishments, placeholder: "What did you accomplish today?" },
    { label: "Pending Tasks", value: pendingTasks, setter: setPendingTasks, placeholder: "What's still left for tomorrow?" },
    { label: "Blockers", value: blockers, setter: setBlockers, placeholder: "Any blockers or issues?" },
    { label: "Notes", value: notes, setter: setNotes, placeholder: "Additional notes or follow-ups" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <CardTitle>{formatDayLabel(date)}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((f) => (
          <div key={f.label} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{f.label}</Label>
              <VoiceInput onTranscript={(t) => f.setter((prev) => (prev ? prev + " " + t : t))} />
            </div>
            <Textarea
              value={f.value}
              onChange={(e) => f.setter(e.target.value)}
              placeholder={f.placeholder}
              rows={3}
            />
          </div>
        ))}
        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving…" : "Save Entry"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default DailyEntryForm;
