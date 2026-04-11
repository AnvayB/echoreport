import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const DEFAULT_TEMPLATE = `Subject: Weekly Status Update - [Week Range]

Hi team,

Here is my weekly status update:

## Highlights
[Key accomplishments this week]

## Challenges / Blockers
[Any issues encountered]

## Completed Tasks
[Detailed list of completed work]

## Carry-over / Next Week
[Tasks remaining for next week]

Best regards`;

const SettingsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_settings")
      .select("email_template")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTemplate(data.email_template);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("user_settings").upsert(
      { user_id: user.id, email_template: template },
      { onConflict: "user_id" }
    );
    setSaving(false);
    if (error) {
      toast.error("Failed to save settings");
    } else {
      toast.success("Settings saved");
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle>Settings</CardTitle>
              <CardDescription>Customize your weekly report email template</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={16}
            className="font-mono text-sm"
            placeholder="Enter your email template..."
          />
          <p className="text-xs text-muted-foreground">
            Use placeholders like [Week Range], [Highlights], etc. The AI will follow this structure when generating your weekly report.
          </p>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save Template"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
