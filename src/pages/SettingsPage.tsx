import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Save, LayoutTemplate, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { TEMPLATE_PRESETS, type TemplatePreset } from "@/lib/templatePresets";

const DEFAULT_TEMPLATE = TEMPLATE_PRESETS[0].template;

const SettingsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<TemplatePreset | null>(null);

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

  const applyPreset = (preset: TemplatePreset) => {
    setTemplate(preset.template);
    setPresetsOpen(false);
    setSelectedPreview(null);
    toast.success(`Loaded "${preset.name}" template`);
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Email Template</p>
            <Dialog open={presetsOpen} onOpenChange={setPresetsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <LayoutTemplate className="mr-2 h-4 w-4" />
                  Browse Examples
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Template Examples</DialogTitle>
                  <DialogDescription>
                    Pick a starting point. Loading a preset replaces your current template — you can edit it after.
                  </DialogDescription>
                </DialogHeader>

                {!selectedPreview ? (
                  <div className="grid gap-2 max-h-[60vh] overflow-y-auto pr-1">
                    {TEMPLATE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => setSelectedPreview(preset)}
                        className="text-left rounded-lg border bg-card p-3 hover:bg-accent transition-colors"
                      >
                        <div className="font-medium text-sm">{preset.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {preset.description}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="font-medium text-sm">{selectedPreview.name}</div>
                      <div className="text-xs text-muted-foreground">{selectedPreview.description}</div>
                    </div>
                    <Textarea
                      value={selectedPreview.template}
                      readOnly
                      rows={14}
                      className="font-mono text-xs"
                    />
                  </div>
                )}

                <DialogFooter className="gap-2">
                  {selectedPreview ? (
                    <>
                      <Button variant="ghost" onClick={() => setSelectedPreview(null)}>
                        Back
                      </Button>
                      <Button onClick={() => applyPreset(selectedPreview)}>
                        <Check className="mr-2 h-4 w-4" />
                        Use this template
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" onClick={() => setPresetsOpen(false)}>
                      Cancel
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

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
