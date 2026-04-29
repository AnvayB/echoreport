import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Save, LayoutTemplate, Check, Plus, Trash2, Star, StarOff, Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { TEMPLATE_PRESETS, type TemplatePreset } from "@/lib/templatePresets";

interface ReportTemplate {
  id: string;
  name: string;
  template: string;
  is_default: boolean;
}

const SettingsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<TemplatePreset | null>(null);

  const active = templates.find((t) => t.id === activeId) ?? null;

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("report_templates")
        .select("id, name, template, is_default")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      let list = (data ?? []) as ReportTemplate[];

      // Seed a default if the user has none yet
      if (list.length === 0) {
        const { data: inserted } = await supabase
          .from("report_templates")
          .insert({
            user_id: user.id,
            name: "My Template",
            template: TEMPLATE_PRESETS[0].template,
            is_default: true,
          })
          .select("id, name, template, is_default")
          .single();
        if (inserted) list = [inserted as ReportTemplate];
      }

      setTemplates(list);
      setActiveId(list.find((t) => t.is_default)?.id ?? list[0]?.id ?? null);
      setLoading(false);
    })();
  }, [user]);

  const updateActive = (patch: Partial<ReportTemplate>) => {
    if (!active) return;
    setTemplates((prev) => prev.map((t) => (t.id === active.id ? { ...t, ...patch } : t)));
  };

  const handleSave = async () => {
    if (!user || !active) return;
    setSaving(true);
    const { error } = await supabase
      .from("report_templates")
      .update({ name: active.name, template: active.template })
      .eq("id", active.id);
    setSaving(false);
    if (error) toast.error("Failed to save template");
    else toast.success("Template saved");
  };

  const handleCreate = async (preset?: TemplatePreset) => {
    if (!user) return;
    const baseName = preset?.name ?? "New Template";
    const { data, error } = await supabase
      .from("report_templates")
      .insert({
        user_id: user.id,
        name: baseName,
        template: preset?.template ?? "",
        is_default: false,
      })
      .select("id, name, template, is_default")
      .single();
    if (error || !data) {
      toast.error("Failed to create template");
      return;
    }
    setTemplates((prev) => [...prev, data as ReportTemplate]);
    setActiveId((data as ReportTemplate).id);
    setPresetsOpen(false);
    setSelectedPreview(null);
    toast.success(`Created "${baseName}"`);
  };

  const handleDelete = async () => {
    if (!user || !active) return;
    if (templates.length === 1) {
      toast.error("You must keep at least one template");
      return;
    }
    const { error } = await supabase.from("report_templates").delete().eq("id", active.id);
    if (error) {
      toast.error("Failed to delete template");
      return;
    }
    const remaining = templates.filter((t) => t.id !== active.id);
    setTemplates(remaining);
    setActiveId(remaining[0]?.id ?? null);
    toast.success("Template deleted");
  };

  const handleSetDefault = async () => {
    if (!user || !active || active.is_default) return;
    // Clear existing default, then set this one
    await supabase.from("report_templates").update({ is_default: false }).eq("user_id", user.id);
    const { error } = await supabase
      .from("report_templates")
      .update({ is_default: true })
      .eq("id", active.id);
    if (error) {
      toast.error("Failed to set default");
      return;
    }
    setTemplates((prev) =>
      prev.map((t) => ({ ...t, is_default: t.id === active.id }))
    );
    toast.success("Default template updated");
  };

  return (
    <div className="mx-auto max-w-3xl p-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle>Report Templates</CardTitle>
              <CardDescription>
                Create multiple weekly report formats and pick one when generating.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Template list */}
              <div className="flex flex-wrap items-center gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveId(t.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                      t.id === activeId
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card hover:bg-accent"
                    }`}
                  >
                    {t.is_default && <Star className="h-3 w-3 fill-current" />}
                    {t.name || "Untitled"}
                  </button>
                ))}
                <Button variant="outline" size="sm" onClick={() => handleCreate()}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> New
                </Button>
                <Dialog open={presetsOpen} onOpenChange={setPresetsOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <LayoutTemplate className="mr-1 h-3.5 w-3.5" /> From Example
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Template Examples</DialogTitle>
                      <DialogDescription>
                        Pick a starting point. This will create a new template — your existing ones stay untouched.
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
                          <Button onClick={() => handleCreate(selectedPreview)}>
                            <Check className="mr-2 h-4 w-4" />
                            Create as new template
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

              {/* Editor */}
              {active && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={active.name}
                      onChange={(e) => updateActive({ name: e.target.value })}
                      placeholder="Template name"
                      className="max-w-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSetDefault}
                      disabled={active.is_default}
                      title={active.is_default ? "This is your default" : "Make default"}
                    >
                      {active.is_default ? (
                        <><Star className="mr-1 h-3.5 w-3.5 fill-current" /> Default</>
                      ) : (
                        <><StarOff className="mr-1 h-3.5 w-3.5" /> Set Default</>
                      )}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={templates.length === 1}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{active.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This template will be permanently removed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <Textarea
                    value={active.template}
                    onChange={(e) => updateActive({ template: e.target.value })}
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
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
