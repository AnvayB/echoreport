import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WeekDayCardProps {
  date: Date;
  hasEntry: boolean;
  isToday: boolean;
  isSelected?: boolean;
  onClick: () => void;
}

const WeekDayCard = ({ date, hasEntry, isToday, isSelected, onClick }: WeekDayCardProps) => {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors hover:bg-accent",
        isToday && "border-primary",
        isSelected && "bg-accent ring-1 ring-primary"
      )}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center gap-0.5 px-1.5 py-2">
        <p className="text-xs font-medium">{format(date, "EEE")}</p>
        <p className="text-[10px] text-muted-foreground">{format(date, "MMM d")}</p>
        {hasEntry ? (
          <CheckCircle className="h-3 w-3 text-primary" />
        ) : (
          <Circle className="h-3 w-3 text-muted-foreground" />
        )}
      </CardContent>
    </Card>
  );
};

export default WeekDayCard;
