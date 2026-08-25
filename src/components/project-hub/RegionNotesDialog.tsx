import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { RegionWithSnapshot } from "@/lib/projectHubUtils";

interface RegionNotesDialogProps {
  region: RegionWithSnapshot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const RegionNotesDialog = ({ region, open, onOpenChange, onSaved }: RegionNotesDialogProps) => {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [complete, setComplete] = useState("0");
  const [semiComplete, setSemiComplete] = useState("0");
  const [incomplete, setIncomplete] = useState("0");
  const [saving, setSaving] = useState(false);

  const num = (v: string) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const total = num(complete) + num(semiComplete) + num(incomplete);

  useEffect(() => {
    if (open && region) {
      setName(region.name);
      setNotes(region.notes);
      setComplete(String(region.manual_complete));
      setSemiComplete(String(region.manual_semi_complete));
      setIncomplete(String(region.manual_incomplete));
    }
  }, [open, region]);

  const handleSave = async () => {
    if (!region) return;
    setSaving(true);
    const { error } = await supabase
      .from("ph_regions")
      .update({
        name: name.trim() || region.name,
        notes,
        manual_complete: num(complete),
        manual_semi_complete: num(semiComplete),
        manual_incomplete: num(incomplete),
        manual_total: total,
      })
      .eq("id", region.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to save notes");
      return;
    }
    toast.success("Notes saved");
    onOpenChange(false);
    onSaved();
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{region?.name} — Notes & Status Snapshot</DialogTitle>
          <DialogDescription>
            This snapshot shows until real projects are added to this region below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Region name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Complete</label>
              <Input
                inputMode="numeric"
                value={complete}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setComplete(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Semi</label>
              <Input
                inputMode="numeric"
                value={semiComplete}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setSemiComplete(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Incomplete</label>
              <Input
                inputMode="numeric"
                value={incomplete}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setIncomplete(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Total</label>
              <Input value={total} readOnly tabIndex={-1} className="bg-muted/50" />
            </div>
          </div>


          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="What's blocking this region, who owns the follow-up, open questions…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RegionNotesDialog;
