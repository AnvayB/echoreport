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
      <CardContent className="flex flex-col items-center gap-1 px-3 py-2.5">
        <p className="text-sm font-medium">{format(date, "EEE")}</p>
        <p className="text-xs text-muted-foreground">{format(date, "MMM d")}</p>
        {hasEntry ? (
          <CheckCircle className="h-4 w-4 text-primary" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" />
        )}
      </CardContent>
    </Card>
  );
};

export default WeekDayCard;
