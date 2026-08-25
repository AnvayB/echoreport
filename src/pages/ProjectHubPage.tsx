import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Trash2, Loader2, MessageSquare } from "lucide-react";
import WorkflowFlowchart from "@/components/project-hub/WorkflowFlowchart";
import RegionDrilldown, { type Region, type Project } from "@/components/project-hub/RegionDrilldown";
import RegionNotesDialog from "@/components/project-hub/RegionNotesDialog";
import { emptyCounts, effectiveCounts, type RegionCounts } from "@/lib/projectHubUtils";

type View = "flowchart" | "regions" | "region-detail";

const REGION_COLUMNS =
  "id, name, notes, manual_complete, manual_semi_complete, manual_incomplete, manual_total";

const SEED_REGIONS = [
  "EMEA",
  "China (SIP)",
  "China (SIA)",
  "Korea",
  "USA (SIP)",
  "USA (SIA)",
  "Japan",
];


const ProjectHubPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("flowchart");
  const [regions, setRegions] = useState<Region[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [notesRegion, setNotesRegion] = useState<Region | null>(null);
  const [loading, setLoading] = useState(true);
  

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: regionData, error: regionError }, { data: projectData, error: projectError }] =
      await Promise.all([
        supabase
          .from("ph_regions")
          .select(REGION_COLUMNS)
          .eq("user_id", user.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("ph_projects")
          .select("id, region_id, project_name, status, status_notes, airtable_project_id")
          .eq("user_id", user.id),
      ]);
    if (regionError || projectError) {
      toast.error("Failed to load Project Hub data — the database tables may not be set up yet.");
    }

    // First visit: seed the standard region set so the grid isn't empty.
    if (!regionError && (regionData ?? []).length === 0) {
      const { error: seedError } = await supabase.from("ph_regions").insert(
        SEED_REGIONS.map((name, i) => ({ user_id: user.id, name, sort_order: i }))
      );
      if (!seedError) {
        const { data: seeded } = await supabase
          .from("ph_regions")
          .select(REGION_COLUMNS)
          .eq("user_id", user.id)
          .order("sort_order", { ascending: true });
        setRegions((seeded ?? []) as Region[]);
        setProjects((projectData ?? []) as Project[]);
        setLoading(false);
        return;
      }
    }

    setRegions((regionData ?? []) as Region[]);
    setProjects((projectData ?? []) as Project[]);
    setLoading(false);
  };


  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const overallCounts: RegionCounts = regions.reduce((acc, region) => {
    const counts = effectiveCounts(
      region,
      projects.filter((p) => p.region_id === region.id).map((p) => p.status)
    );
    return {
      complete: acc.complete + counts.complete,
      semiComplete: acc.semiComplete + counts.semiComplete,
      incomplete: acc.incomplete + counts.incomplete,
      notStarted: acc.notStarted + counts.notStarted,
      total: acc.total + counts.total,
    };
  }, emptyCounts());


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


              {regions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No regions available.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {regions.map((region) => {
                    const regionProjects = projects.filter((p) => p.region_id === region.id);
                    const counts = effectiveCounts(
                      region,
                      regionProjects.map((p) => p.status)
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
                              {regionProjects.length === 0 && counts.total > 0 && " (snapshot)"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNotesRegion(region);
                              }}
                              title="Notes"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </Button>
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
                                    This will also delete all {regionProjects.length} tracked
                                    project row(s) in this region.
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
                          </div>
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

      <RegionNotesDialog
        region={notesRegion}
        open={notesRegion !== null}
        onOpenChange={(open) => !open && setNotesRegion(null)}
        onSaved={loadData}
      />
    </div>
  );
};

export default ProjectHubPage;
