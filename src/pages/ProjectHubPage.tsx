import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Loader2, MessageSquare } from "lucide-react";
import WorkflowFlowchart from "@/components/project-hub/WorkflowFlowchart";
import RegionNotesDialog from "@/components/project-hub/RegionNotesDialog";
import {
  emptyCounts,
  effectiveCounts,
  type RegionCounts,
  type RegionWithSnapshot,
} from "@/lib/projectHubUtils";

type View = "flowchart" | "regions";

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
  const [regions, setRegions] = useState<RegionWithSnapshot[]>([]);
  const [notesRegion, setNotesRegion] = useState<RegionWithSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const { data: regionData, error: regionError } = await supabase
      .from("ph_regions")
      .select(REGION_COLUMNS)
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true });

    if (regionError) {
      toast.error("Failed to load Project Hub data.");
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
        setRegions((seeded ?? []) as RegionWithSnapshot[]);
        setLoading(false);
        return;
      }
    }

    setRegions((regionData ?? []) as RegionWithSnapshot[]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const overallCounts: RegionCounts = regions.reduce((acc, region) => {
    const counts = effectiveCounts(region, []);
    return {
      complete: acc.complete + counts.complete,
      semiComplete: acc.semiComplete + counts.semiComplete,
      incomplete: acc.incomplete + counts.incomplete,
      notStarted: acc.notStarted + counts.notStarted,
      total: acc.total + counts.total,
    };
  }, emptyCounts());

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
                    const counts = effectiveCounts(region, []);
                    return (
                      <Card
                        key={region.id}
                        className="cursor-pointer hover:border-primary hover:bg-accent/50 transition-colors"
                        onClick={() => setNotesRegion(region)}
                      >
                        <CardContent className="p-4 flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold">{region.name}</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              {counts.complete}/{counts.semiComplete}/{counts.incomplete} |{" "}
                              {counts.total}
                            </p>
                          </div>
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
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
