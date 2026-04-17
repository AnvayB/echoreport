import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import WeekDayCard from "@/components/WeekDayCard";
import DailyEntryPanel from "@/components/DailyEntryPanel";
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
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [entryDates, setEntryDates] = useState<Set<string>>(new Set());

  const weekdays = getWeekdays(currentWeek);
  const today = new Date();

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">Echo Report</h1>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4">
        {/* 3-column grid: calendar | tasks + daily entry | weekly report */}
        <div className="grid gap-6 lg:grid-cols-[280px_1fr_1fr] md:grid-cols-[240px_1fr]">
          {/* Column 1: Calendar / Week view */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(navigateWeek(currentWeek, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-sm font-medium">{formatWeekLabel(currentWeek)}</h2>
              <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(navigateWeek(currentWeek, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1.5">
              {weekdays.map((day) => (
                <WeekDayCard
                  key={formatDateKey(day)}
                  date={day}
                  hasEntry={entryDates.has(formatDateKey(day))}
                  isToday={isSameDay(day, today)}
                  isSelected={isSameDay(day, selectedDay)}
                  onClick={() => setSelectedDay(day)}
                />
              ))}
            </div>
          </div>

          {/* Column 2: Tasks for Today + Daily Entry */}
          <div className="space-y-6">
            <TasksForToday selectedDate={selectedDay} />
            <DailyEntryPanel
              date={selectedDay}
              onSaved={loadEntries}
            />
          </div>

          {/* Column 3: Weekly Report */}
          <div className="md:col-span-2 lg:col-span-1">
            <WeeklyReportGenerator currentWeek={currentWeek} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
