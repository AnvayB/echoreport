import StageCard from "./StageCard";
import type { RegionCounts } from "@/lib/projectHubUtils";

interface Stage {
  title: string;
  description: string;
}

const STAGES: Stage[] = [
  {
    title: "Collect AE Projects from Each Region",
    description: "Gather each region's project list, ready to be consolidated.",
  },
  {
    title: "Compile into AE Projects Master",
    description: "Merge regional lists into the central AE Projects Master sheet.",
  },
  {
    title: "Check Projects Against Airtable",
    description: "For each project, check whether the company/project already exists in Airtable.",
  },
  {
    title: "Determine Completion Status",
    description: "Classify each project as Complete, Semi-Complete, or Incomplete.",
  },
  {
    title: "Fill Missing Info with AE Managers",
    description: "Work with AE managers to gather whatever information is missing.",
  },
  {
    title: "Recheck Airtable (Loop)",
    description: "As info arrives, recheck Airtable and update the Master until sufficiently complete.",
  },
  {
    title: "Add Logos and Vertical Info",
    description: "Attach company logos and vertical info, ideally sourced from SharePoint.",
  },
  {
    title: "Get Missing Projects Added to Airtable",
    description: "Hand missing companies/projects to Matt or Gio to add to Airtable.",
  },
  {
    title: "Add Complete Projects to Project Hub",
    description: "Once Complete, publish the project to the Project Hub website.",
  },
  {
    title: "Final Chip/IP Version Info",
    description: "Collect remaining chip/IP details, eventually self-served by managers via Project Hub.",
  },
];

const REGION_STAGE_INDEX = 4;

interface WorkflowFlowchartProps {
  onSelectRegionStage: () => void;
  overallCounts: RegionCounts;
}

const WorkflowFlowchart = ({ onSelectRegionStage, overallCounts }: WorkflowFlowchartProps) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {STAGES.map((stage, i) => {
          const num = i + 1;
          const isRegionStage = num === REGION_STAGE_INDEX;
          return (
            <StageCard
              key={stage.title}
              index={num}
              title={stage.title}
              description={stage.description}
              onClick={isRegionStage ? onSelectRegionStage : undefined}
              counts={isRegionStage ? overallCounts : undefined}
            />
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Stage 6 loops back into stages 4–5: identify missing info → contact AE managers → receive
        info → recheck Airtable → update status → repeat until sufficiently complete.
      </p>
    </div>
  );
};

export default WorkflowFlowchart;
