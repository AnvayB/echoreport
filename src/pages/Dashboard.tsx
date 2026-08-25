import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import WeekDayCard from "@/components/WeekDayCard";
import DailyEntryPanel from "@/components/DailyEntryPanel";
import TasksForToday from "@/components/TasksForToday";
import { TasksForTodayProvider } from "@/components/TasksForTodayProvider";
import WeeklyReportGenerator from "@/components/WeeklyReportGenerator";
import { getWeekdays, formatDateKey, formatWeekLabel, navigateWeek } from "@/lib/weekUtils";
import { ChevronLeft, ChevronRight, LogOut, Settings, Workflow } from "lucide-react";
import { isSameDay } from "date-fns";
import { useNavigate } from "react-router-dom";

const PROJECT_HUB_OWNER_EMAIL = "anvay.bhanap@gmail.com";

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
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">Echo Report</h1>
          <div className="flex gap-1">
            {user?.email?.toLowerCase() === PROJECT_HUB_OWNER_EMAIL.toLowerCase() && (
              <Button variant="ghost" size="icon" onClick={() => navigate("/project-hub")}>
                <Workflow className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] p-4">
        <TasksForTodayProvider selectedDate={selectedDay}>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[1fr_1.6fr_1fr]">
            {/* Column 1: Horizontal calendar + Completed Yesterday */}
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(navigateWeek(currentWeek, -1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="text-xs font-medium">{formatWeekLabel(currentWeek)}</h2>
                  <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(navigateWeek(currentWeek, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
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
              <TasksForToday section="completedYesterday" />
            </div>

            {/* Column 2: Tasks for Today (pending) + Daily Entry */}
            <div className="space-y-6">
              <TasksForToday section="pending" />
              <DailyEntryPanel date={selectedDay} onSaved={loadEntries} />
            </div>

            {/* Column 3: Weekly Report + Completed Today */}
            <div className="space-y-6 md:col-span-2 lg:col-span-1">
              <WeeklyReportGenerator currentWeek={currentWeek} />
              <TasksForToday section="completedToday" />
            </div>
          </div>
        </TasksForTodayProvider>
      </main>
    </div>
  );
};

export default Dashboard;
