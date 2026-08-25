import { useEffect, useState } from "react";
import StageCard from "./StageCard";
import type { RegionCounts } from "@/lib/projectHubUtils";

interface Stage {
  title: string;
  description: string;
  optional?: boolean;
}

// Stage 7 (Add Logos/Vertical Info) is non-essential and actually happens between
// "Get Missing Projects Added to Airtable" and "Add Complete Projects to Project Hub" —
// so it's ordered/numbered there instead of where it originally sat.
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
    title: "Get Missing Projects Added to Airtable",
    description: "Hand missing companies/projects to Matt or Gio to add to Airtable.",
  },
  {
    title: "Add Logos and Vertical Info",
    description: "Attach company logos and vertical info, ideally sourced from SharePoint.",
    optional: true,
  },
  {
    title: "Add Complete Projects to Project Hub",
    description: "Once Complete, publish the project to Project Hub and add it to Databricks.",
  },
  {
    title: "Final Chip/IP Version Info",
    description: "Collect remaining chip/IP details, eventually self-served by managers via Project Hub.",
  },
];

const REGION_STAGE_INDEX = 4;

// Snake layout: row 0 is stages 1-5 left→right, row 1 is stages 6-10 right→left,
// so stage 5 sits directly above stage 6 and stage 4 lines up with the loop-back target.
const POS: Record<number, { col: number; row: number }> = {
  1: { col: 0, row: 0 },
  2: { col: 1, row: 0 },
  3: { col: 2, row: 0 },
  4: { col: 3, row: 0 },
  5: { col: 4, row: 0 },
  6: { col: 4, row: 1 },
  7: { col: 3, row: 1 },
  8: { col: 2, row: 1 },
  9: { col: 1, row: 1 },
  10: { col: 0, row: 1 },
};

const CARD_W = 208;
const CARD_H = 176;
const GAP_X = 60;
const GAP_Y = 84;
const ORIGIN_Y = 76;
const RIGHT_PAD = 70;

const colX = (col: number) => col * (CARD_W + GAP_X);
const rowY = (row: number) => ORIGIN_Y + row * (CARD_H + GAP_Y);

const CONTAINER_W = colX(4) + CARD_W + RIGHT_PAD;
const CONTAINER_H = rowY(1) + CARD_H + 24;

type Side = "left" | "right" | "top" | "bottom";

function edge(stage: number, side: Side) {
  const p = POS[stage];
  const x = colX(p.col);
  const y = rowY(p.row);
  switch (side) {
    case "right":
      return { x: x + CARD_W, y: y + CARD_H / 2 };
    case "left":
      return { x, y: y + CARD_H / 2 };
    case "top":
      return { x: x + CARD_W / 2, y };
    case "bottom":
    default:
      return { x: x + CARD_W / 2, y: y + CARD_H };
  }
}

const MAIN_FLOW: Array<[number, number, Side, Side]> = [
  [1, 2, "right", "left"],
  [2, 3, "right", "left"],
  [3, 4, "right", "left"],
  [4, 5, "right", "left"],
  [5, 6, "bottom", "top"],
  [6, 7, "left", "right"],
  [7, 8, "left", "right"],
  [8, 9, "left", "right"],
  [9, 10, "left", "right"],
];

const LOOP_STORAGE_KEY = "ph_workflow_done_stages";

interface WorkflowFlowchartProps {
  onSelectRegionStage: () => void;
  overallCounts: RegionCounts;
}

const WorkflowFlowchart = ({ onSelectRegionStage, overallCounts }: WorkflowFlowchartProps) => {
  const [doneStages, setDoneStages] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOOP_STORAGE_KEY);
      if (raw) setDoneStages(new Set(JSON.parse(raw)));
    } catch {
      // ignore malformed local storage
    }
  }, []);

  const toggleDone = (num: number) => {
    setDoneStages((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      localStorage.setItem(LOOP_STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // Loop-back arrow: stage 6 → stage 4, routed around the outside-right/top of the
  // grid so it reads as a cycle alongside the straight 4→5→6 arrows.
  const loopStart = edge(6, "right");
  const loopEnd = edge(4, "top");
  const loopRightX = colX(POS[6].col) + CARD_W + 40;
  const loopTopY = ORIGIN_Y - 44;
  const loopPath = `M ${loopStart.x} ${loopStart.y} L ${loopRightX} ${loopStart.y} L ${loopRightX} ${loopTopY} L ${loopEnd.x} ${loopTopY} L ${loopEnd.x} ${loopEnd.y}`;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-2">
        <div className="relative" style={{ width: CONTAINER_W, height: CONTAINER_H }}>
          <svg
            className="absolute inset-0 pointer-events-none"
            width={CONTAINER_W}
            height={CONTAINER_H}
          >
            <defs>
              <marker
                id="ph-arrow-main"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
              </marker>
              <marker
                id="ph-arrow-loop"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="#f59e0b" />
              </marker>
            </defs>

            {MAIN_FLOW.map(([from, to, fromSide, toSide]) => {
              const a = edge(from, fromSide);
              const b = edge(to, toSide);
              return (
                <line
                  key={`${from}-${to}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#94a3b8"
                  strokeWidth={2}
                  markerEnd="url(#ph-arrow-main)"
                />
              );
            })}

            <path
              d={loopPath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinejoin="round"
              markerEnd="url(#ph-arrow-loop)"
            />
            <text
              x={(edge(4, "top").x + loopRightX) / 2}
              y={loopTopY - 8}
              textAnchor="middle"
              className="fill-amber-600 dark:fill-amber-400"
              fontSize={10}
              fontWeight={500}
            >
              Loop: repeat 4 → 5 → 6 until sufficiently complete
            </text>
          </svg>

          {STAGES.map((stage, i) => {
            const num = i + 1;
            const pos = POS[num];
            const isRegionStage = num === REGION_STAGE_INDEX;
            return (
              <div
                key={stage.title}
                className="absolute"
                style={{ left: colX(pos.col), top: rowY(pos.row), width: CARD_W, height: CARD_H }}
              >
                <StageCard
                  index={num}
                  title={stage.title}
                  description={stage.description}
                  optional={stage.optional}
                  onClick={isRegionStage ? onSelectRegionStage : undefined}
                  counts={isRegionStage ? overallCounts : undefined}
                  done={doneStages.has(num)}
                  onToggleDone={() => toggleDone(num)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WorkflowFlowchart;
