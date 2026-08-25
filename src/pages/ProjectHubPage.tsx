import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import WorkflowFlowchart from "@/components/project-hub/WorkflowFlowchart";
import RegionDrilldown, { type Region, type Project } from "@/components/project-hub/RegionDrilldown";
import { tallyCounts } from "@/lib/projectHubUtils";

type View = "flowchart" | "regions" | "region-detail";

const ProjectHubPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("flowchart");
  const [regions, setRegions] = useState<Region[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newRegionName, setNewRegionName] = useState("");

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: regionData }, { data: projectData }] = await Promise.all([
      supabase.from("ph_regions").select("id, name").eq("user_id", user.id).order("sort_order", { ascending: true }),
      supabase
        .from("ph_projects")
        .select("id, region_id, project_name, status, status_notes, airtable_project_id")
        .eq("user_id", user.id),
    ]);
    setRegions((regionData ?? []) as Region[]);
    setProjects((projectData ?? []) as Project[]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const overallCounts = tallyCounts(projects.map((p) => p.status));

  const handleAddRegion = async () => {
    if (!user || !newRegionName.trim()) return;
    const { error } = await supabase
      .from("ph_regions")
      .insert({ user_id: user.id, name: newRegionName.trim(), sort_order: regions.length });
    if (error) {
      toast.error("Failed to add region");
      return;
    }
    setNewRegionName("");
    toast.success("Region added");
    loadData();
  };

  const handleDeleteRegion = async (region: Region) => {
    const { error } = await supabase.from("ph_regions").delete().eq("id", region.id);
    if (error) {
      toast.error("Failed to delete region");
      return;
    }
    toast.success("Region deleted");
    loadData();
  };

  const selectedRegion = regions.find((r) => r.id === selectedRegionId) ?? null;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle>AE Projects Master / Project Hub Workflow</CardTitle>
              <CardDescription>
                Track where each region's projects stand in the collect → Airtable → Project Hub
                process.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {view === "flowchart" && (
            <WorkflowFlowchart
              onSelectRegionStage={() => setView("regions")}
              overallCounts={overallCounts}
            />
          )}

          {view === "regions" && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setView("flowchart")}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Workflow
              </Button>

              <div className="flex items-center gap-2">
                <Input
                  value={newRegionName}
                  onChange={(e) => setNewRegionName(e.target.value)}
                  placeholder="New region name"
                  className="max-w-xs"
                  onKeyDown={(e) => e.key === "Enter" && handleAddRegion()}
                />
                <Button size="sm" onClick={handleAddRegion} disabled={!newRegionName.trim()}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Region
                </Button>
              </div>

              {regions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No regions yet — add one above to start tracking projects.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {regions.map((region) => {
                    const counts = tallyCounts(
                      projects.filter((p) => p.region_id === region.id).map((p) => p.status)
                    );
                    return (
                      <Card
                        key={region.id}
                        className="cursor-pointer hover:border-primary hover:bg-accent/50 transition-colors"
                        onClick={() => {
                          setSelectedRegionId(region.id);
                          setView("region-detail");
                        }}
                      >
                        <CardContent className="p-4 flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold">{region.name}</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              {counts.complete}/{counts.semiComplete}/{counts.incomplete} |{" "}
                              {counts.total}
                            </p>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{region.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will also delete all {counts.total} project(s) in this
                                  region.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteRegion(region)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {view === "region-detail" && selectedRegion && (
            <RegionDrilldown
              region={selectedRegion}
              projects={projects.filter((p) => p.region_id === selectedRegion.id)}
              onBack={() => setView("regions")}
              onProjectsChanged={loadData}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectHubPage;
