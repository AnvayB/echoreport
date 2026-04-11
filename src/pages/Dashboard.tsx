import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import WeekDayCard from "@/components/WeekDayCard";
import DailyEntryForm from "@/components/DailyEntryForm";
import TasksForToday from "@/components/TasksForToday";
import WeeklyReportGenerator from "@/components/WeeklyReportGenerator";
import { getWeekdays, formatDateKey, formatWeekLabel, navigateWeek } from "@/lib/weekUtils";
import { ChevronLeft, ChevronRight, LogOut, Settings } from "lucide-react";
import { isSameDay } from "date-fns";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [entryDates, setEntryDates] = useState<Set<string>>(new Set());

  const weekdays = getWeekdays(currentWeek);

  const loadEntries = async () => {
    if (!user) return;
    const dates = weekdays.map(formatDateKey);
    const { data } = await supabase
      .from("daily_entries")
      .select("entry_date")
      .eq("user_id", user.id)
      .in("entry_date", dates);
    setEntryDates(new Set((data || []).map((e) => e.entry_date)));
  };

  useEffect(() => {
    loadEntries();
  }, [user, currentWeek]);

  if (selectedDay) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <DailyEntryForm
          date={selectedDay}
          onBack={() => {
            setSelectedDay(null);
            loadEntries();
          }}
        />
      </div>
    );
  }

  const today = new Date();

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Work Journal</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(navigateWeek(currentWeek, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-medium">{formatWeekLabel(currentWeek)}</h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(navigateWeek(currentWeek, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day cards */}
      <div className="space-y-2">
        {weekdays.map((day) => (
          <WeekDayCard
            key={formatDateKey(day)}
            date={day}
            hasEntry={entryDates.has(formatDateKey(day))}
            isToday={isSameDay(day, today)}
            onClick={() => setSelectedDay(day)}
          />
        ))}
      </div>

      {/* Tasks for today */}
      <TasksForToday />

      {/* Weekly report */}
      <WeeklyReportGenerator currentWeek={currentWeek} />
    </div>
  );
};

export default Dashboard;
