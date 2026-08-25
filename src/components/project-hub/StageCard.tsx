import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RegionCounts } from "@/lib/projectHubUtils";

interface StageCardProps {
  index: number;
  title: string;
  description: string;
  onClick?: () => void;
  counts?: RegionCounts;
}

const StageCard = ({ index, title, description, onClick, counts }: StageCardProps) => {
  const clickable = Boolean(onClick);

  return (
    <Card
      onClick={onClick}
      className={cn(
        "h-full transition-colors",
        clickable && "cursor-pointer hover:border-primary hover:bg-accent/50"
      )}
    >
      <CardContent className="p-4 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
            {index}
          </span>
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        {counts && counts.total > 0 && (
          <div className="pt-1 text-xs font-medium text-muted-foreground">
            {counts.complete}/{counts.semiComplete}/{counts.incomplete} | {counts.total}
          </div>
        )}
        {clickable && (
          <div className="pt-1 text-xs font-medium text-primary">Click to view regions →</div>
        )}
      </CardContent>
    </Card>
  );
};

export default StageCard;
