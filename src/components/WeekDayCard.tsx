import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WeekDayCardProps {
  date: Date;
  hasEntry: boolean;
  isToday: boolean;
  onClick: () => void;
}

const WeekDayCard = ({ date, hasEntry, isToday, onClick }: WeekDayCardProps) => {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors hover:bg-accent",
        isToday && "border-primary"
      )}
      onClick={onClick}
    >
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="font-medium">{format(date, "EEEE")}</p>
          <p className="text-sm text-muted-foreground">{format(date, "MMM d")}</p>
        </div>
        {hasEntry ? (
          <CheckCircle className="h-5 w-5 text-primary" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
      </CardContent>
    </Card>
  );
};

export default WeekDayCard;
