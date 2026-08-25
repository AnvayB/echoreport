import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RegionCounts } from "@/lib/projectHubUtils";

interface StageCardProps {
  index: number;
  title: string;
  description: string;
  onClick?: () => void;
  counts?: RegionCounts;
  optional?: boolean;
  done: boolean;
  onToggleDone: () => void;
}

const StageCard = ({
  index,
  title,
  description,
  onClick,
  counts,
  optional,
  done,
  onToggleDone,
}: StageCardProps) => {
  const clickable = Boolean(onClick);

  return (
    <Card
      onClick={onClick}
      className={cn(
        "relative h-full overflow-hidden transition-colors",
        optional && "border-dashed",
        clickable && "cursor-pointer hover:border-primary hover:bg-accent/50"
      )}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-emerald-500 transition-[width] duration-700 ease-out"
        style={{ width: done ? "100%" : "0%" }}
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone();
        }}
        title={done ? "Mark as not done" : "Mark as done"}
        className="absolute top-2 right-2 z-10 rounded-full p-0.5 transition-colors hover:bg-black/10"
      >
        <CheckCircle2
          className={cn(
            "h-5 w-5 transition-colors",
            done ? "fill-white text-emerald-600" : "text-muted-foreground"
          )}
        />
      </button>

      <CardContent className={cn("relative z-[1] p-4 space-y-1.5", done && "text-white")}>
        <div className="flex items-center gap-2 pr-6">
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              done ? "bg-white text-emerald-600" : "bg-primary text-primary-foreground"
            )}
          >
            {index}
          </span>
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        </div>
        {optional && (
          <Badge variant="secondary" className="text-[10px]">
            Optional
          </Badge>
        )}
        <p className={cn("text-xs", done ? "text-white/90" : "text-muted-foreground")}>
          {description}
        </p>
        {counts && counts.total > 0 && (
          <div className={cn("pt-1 text-xs font-medium", done ? "text-white/90" : "text-muted-foreground")}>
            {counts.complete}/{counts.semiComplete}/{counts.incomplete} | {counts.total}
          </div>
        )}
        {clickable && (
          <div className={cn("pt-1 text-xs font-medium", done ? "text-white" : "text-primary")}>
            Click to view regions →
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StageCard;
