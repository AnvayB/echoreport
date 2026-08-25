import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PROJECT_STATUSES, STATUS_LABEL, type ProjectStatus } from "@/lib/projectHubUtils";

export interface ProjectFormValues {
  projectName: string;
  status: ProjectStatus;
  statusNotes: string;
  airtableProjectId: string;
}

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: ProjectFormValues;
  onSubmit: (values: ProjectFormValues) => void;
  saving?: boolean;
}

const EMPTY_VALUES: ProjectFormValues = {
  projectName: "",
  status: "not_started",
  statusNotes: "",
  airtableProjectId: "",
};

const ProjectFormDialog = ({
  open,
  onOpenChange,
  initialValues,
  onSubmit,
  saving,
}: ProjectFormDialogProps) => {
  const [values, setValues] = useState<ProjectFormValues>(initialValues ?? EMPTY_VALUES);

  useEffect(() => {
    if (open) setValues(initialValues ?? EMPTY_VALUES);
  }, [open, initialValues]);

  const isEditing = Boolean(initialValues);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Project" : "New Project"}</DialogTitle>
          <DialogDescription>
            Track this project's completion status and any notes for follow-up.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Project</label>
            <Input
              value={values.projectName}
              onChange={(e) => setValues((v) => ({ ...v, projectName: e.target.value }))}
              placeholder="Project name"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <Select
              value={values.status}
              onValueChange={(status: ProjectStatus) => setValues((v) => ({ ...v, status }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status Notes</label>
            <Textarea
              value={values.statusNotes}
              onChange={(e) => setValues((v) => ({ ...v, statusNotes: e.target.value }))}
              rows={3}
              placeholder="What's blocking this, who owns the follow-up, etc."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Airtable Project ID (optional)</label>
            <Input
              value={values.airtableProjectId}
              onChange={(e) => setValues((v) => ({ ...v, airtableProjectId: e.target.value }))}
              placeholder="Populated once added to Airtable"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!values.projectName.trim() || saving}
            onClick={() => onSubmit(values)}
          >
            {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectFormDialog;
