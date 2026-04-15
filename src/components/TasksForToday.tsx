import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getPreviousWorkday, formatDateKey } from "@/lib/weekUtils";
import { Loader2, ListTodo, CircleCheckBig } from "lucide-react";
import { toast } from "sonner";

interface TaskItem {
  text: string;
  completed: boolean;
}

interface TaskSection {
  title: string;
  items: TaskItem[];
}

const TasksForToday = () => {
  const { user } = useAuth();
  const [sections, setSections] = useState<TaskSection[] | null>(null);
  const [loading, setLoading] = useState(false);
  const todayKey = formatDateKey(new Date());

  // Load existing tasks from DB on mount
  useEffect(() => {
    if (!user) return;
    const loadExisting = async () => {
      const { data } = await supabase
        .from("daily_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("task_date", todayKey);

      if (data && data.length > 0) {
        const sectionMap = new Map<string, TaskItem[]>();
        data.forEach((row) => {
          if (!sectionMap.has(row.section)) sectionMap.set(row.section, []);
          sectionMap.get(row.section)!.push({ text: row.task_text, completed: row.completed });
        });
        const restored: TaskSection[] = [];
        // Maintain consistent order
        const order = ["Completed Yesterday", "Pending for Today", "Carryover, Blockers & Follow-ups"];
        order.forEach((title) => {
          if (sectionMap.has(title)) {
            restored.push({ title, items: sectionMap.get(title)! });
            sectionMap.delete(title);
          }
        });
        // Any remaining sections
        sectionMap.forEach((items, title) => restored.push({ title, items }));
        setSections(restored);
      }
    };
    loadExisting();
  }, [user, todayKey]);

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);

    const prevDay = getPreviousWorkday(new Date());
    const prevKey = formatDateKey(prevDay);

    // Fetch previous day's entry and completed tasks in parallel
    const [entryRes, tasksRes] = await Promise.all([
      supabase
        .from("daily_entries")
        .select("*")
        .eq("user_id", user.id)
        .eq("entry_date", prevKey)
        .maybeSingle(),
      supabase
        .from("daily_tasks")
        .select("task_text, completed, section")
        .eq("user_id", user.id)
        .eq("task_date", prevKey),
    ]);

    if (!entryRes.data) {
      setSections([{ title: "Info", items: [{ text: "No entry found for the previous workday. Start fresh today!", completed: false }] }]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("ai-daily-tasks", {
        body: {
          entry: entryRes.data,
          completed_tasks: tasksRes.data || [],
        },
      });
      if (error) throw error;

      if (data.sections) {
        const parsed: TaskSection[] = data.sections.map((s: { title: string; items: string[] }) => ({
          title: s.title,
          items: s.items.map((text: string) => ({ text, completed: false })),
        }));
        setSections(parsed);
        // Persist to DB
        await persistTasks(parsed);
      } else if (data.summary) {
        // Fallback for markdown response
        setSections([{ title: "Tasks", items: [{ text: data.summary, completed: false }] }]);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate task summary");
    } finally {
      setLoading(false);
    }
  };

  const persistTasks = async (taskSections: TaskSection[]) => {
    if (!user) return;
    // Delete existing tasks for today, then insert new ones
    await supabase.from("daily_tasks").delete().eq("user_id", user.id).eq("task_date", todayKey);

    const rows = taskSections.flatMap((section) =>
      section.items.map((item) => ({
        user_id: user.id,
        task_date: todayKey,
        section: section.title,
        task_text: item.text,
        completed: item.completed,
      }))
    );
    if (rows.length > 0) {
      await supabase.from("daily_tasks").insert(rows);
    }
  };

  const toggleTask = async (sectionIdx: number, itemIdx: number) => {
    if (!sections || !user) return;
    const updated = sections.map((section, si) => {
      if (si !== sectionIdx) return section;
      return {
        ...section,
        items: section.items.map((item, ii) => {
          if (ii !== itemIdx) return item;
          return { ...item, completed: !item.completed };
        }),
      };
    });
    setSections(updated);

    const task = updated[sectionIdx].items[itemIdx];
    // Update in DB
    const { data: existing } = await supabase
      .from("daily_tasks")
      .select("id")
      .eq("user_id", user.id)
      .eq("task_date", todayKey)
      .eq("task_text", task.text)
      .eq("section", updated[sectionIdx].title)
      .maybeSingle();

    if (existing) {
      await supabase.from("daily_tasks").update({ completed: task.completed }).eq("id", existing.id);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListTodo className="h-5 w-5" /> Tasks for Today
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!sections && !loading && (
          <Button onClick={fetchTasks} variant="outline" className="w-full">
            What are my tasks for today?
          </Button>
        )}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {sections && (
          <div className="space-y-4">
            {sections.map((section, si) => (
              <div key={si}>
                <p className="font-semibold text-sm text-foreground mb-2">{section.title}</p>
                <div className="space-y-1.5">
                  {section.items.map((item, ii) => (
                    <label
                      key={ii}
                      className="flex items-start gap-2 cursor-pointer group"
                    >
                      <Checkbox
                        checked={item.completed}
                        onCheckedChange={() => toggleTask(si, ii)}
                        className="mt-0.5"
                      />
                      <span
                        className={`text-sm leading-snug transition-all ${
                          item.completed
                            ? "line-through text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {sections && (
          <Button onClick={fetchTasks} variant="ghost" size="sm" className="mt-3">
            Refresh
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default TasksForToday;
