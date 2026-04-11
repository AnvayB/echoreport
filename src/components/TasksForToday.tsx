import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPreviousWorkday, formatDateKey } from "@/lib/weekUtils";
import { Loader2, ListTodo } from "lucide-react";
import { toast } from "sonner";

const TasksForToday = () => {
  const { user } = useAuth();
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);

    const prevDay = getPreviousWorkday(new Date());
    const { data: entry } = await supabase
      .from("daily_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("entry_date", formatDateKey(prevDay))
      .maybeSingle();

    if (!entry) {
      setResult("No entry found for the previous workday. Start fresh today!");
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("ai-daily-tasks", {
        body: { entry },
      });
      if (error) throw error;
      setResult(data.summary);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate task summary");
    } finally {
      setLoading(false);
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
        {!result && !loading && (
          <Button onClick={fetchTasks} variant="outline" className="w-full">
            What are my tasks for today?
          </Button>
        )}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {result && (
          <div className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">
            {result}
          </div>
        )}
        {result && (
          <Button onClick={fetchTasks} variant="ghost" size="sm" className="mt-2">
            Refresh
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default TasksForToday;
