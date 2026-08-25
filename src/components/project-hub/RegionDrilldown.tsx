import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Pencil, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import ProjectFormDialog, { type ProjectFormValues } from "./ProjectFormDialog";
import RegionNotesDialog from "./RegionNotesDialog";
import {
  STATUS_LABEL, STATUS_BADGE_CLASS, effectiveCounts, type ProjectStatus, type RegionWithSnapshot,
} from "@/lib/projectHubUtils";

export type Region = RegionWithSnapshot;

export interface Project {
  id: string;
  region_id: string;
  project_name: string;
  status: ProjectStatus;
  status_notes: string;
  airtable_project_id: string | null;
}

interface RegionDrilldownProps {
  region: Region;
  projects: Project[];
  onBack: () => void;
  onProjectsChanged: () => void;
}

const RegionDrilldown = ({ region, projects, onBack, onProjectsChanged }: RegionDrilldownProps) => {
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);

  const counts = effectiveCounts(region, projects.map((p) => p.status));
  const filtered = projects.filter((p) =>
    p.project_name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingProject(null);
    setFormOpen(true);
  };

  const openEdit = (project: Project) => {
    setEditingProject(project);
    setFormOpen(true);
  };

  const handleSubmit = async (values: ProjectFormValues) => {
    if (!user) return;
    setSaving(true);
    const payload = {
      project_name: values.projectName.trim(),
      status: values.status,
      status_notes: values.statusNotes,
      airtable_project_id: values.airtableProjectId.trim() || null,
    };

    const { error } = editingProject
      ? await supabase.from("ph_projects").update(payload).eq("id", editingProject.id)
      : await supabase
          .from("ph_projects")
          .insert({ ...payload, user_id: user.id, region_id: region.id });

    setSaving(false);
    if (error) {
      toast.error(editingProject ? "Failed to update project" : "Failed to add project");
      return;
    }
    toast.success(editingProject ? "Project updated" : "Project added");
    setFormOpen(false);
    onProjectsChanged();
  };

  const handleDelete = async (project: Project) => {
    const { error } = await supabase.from("ph_projects").delete().eq("id", project.id);
    if (error) {
      toast.error("Failed to delete project");
      return;
    }
    toast.success("Project deleted");
    onProjectsChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{region.name}</h2>
            <p className="text-xs text-muted-foreground">
              {counts.complete} complete / {counts.semiComplete} semi-complete /{" "}
              {counts.incomplete} incomplete / {counts.notStarted} not started — {counts.total} total
              {projects.length === 0 && " (snapshot)"}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setNotesOpen(true)}>
          <MessageSquare className="mr-1 h-3.5 w-3.5" /> Notes
        </Button>
      </div>

      {region.notes && (
        <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
          {region.notes}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          className="max-w-xs"
        />
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Project
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Status Notes</TableHead>
            <TableHead className="w-[64px] text-center">Done</TableHead>
            <TableHead className="w-[96px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                No projects yet.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-medium">{project.project_name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={STATUS_BADGE_CLASS[project.status]}>
                    {STATUS_LABEL[project.status]}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-md text-sm text-muted-foreground">
                  {project.status_notes || "—"}
                </TableCell>
                <TableCell className="text-center">
                  {project.status === "complete" ? (
                    <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Circle className="mx-auto h-4 w-4 text-muted-foreground/50" />
                  )}
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(project)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{project.project_name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This project will be permanently removed from {region.name}.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(project)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <ProjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        saving={saving}
        initialValues={
          editingProject
            ? {
                projectName: editingProject.project_name,
                status: editingProject.status,
                statusNotes: editingProject.status_notes,
                airtableProjectId: editingProject.airtable_project_id ?? "",
              }
            : undefined
        }
        onSubmit={handleSubmit}
      />

      <RegionNotesDialog
        region={region}
        open={notesOpen}
        onOpenChange={setNotesOpen}
        onSaved={onProjectsChanged}
      />
    </div>
  );
};

export default RegionDrilldown;
