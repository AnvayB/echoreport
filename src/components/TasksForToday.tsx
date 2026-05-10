import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, ListTodo, CircleCheckBig, Check, Plus, Sparkles, X, GripVertical, AlertTriangle,
} from "lucide-react";
import { useTasksForToday, type TaskRow, type TaskGroup, type Bucket } from "./TasksForTodayContext";
import TaskText from "./TaskText";
import VoiceInput from "./VoiceInput";

interface TasksForTodayProps {
  section?: "pending" | "completedYesterday" | "completedToday";
}

const TasksForToday = ({ section = "pending" }: TasksForTodayProps) => {
  const {
    loading, loaded,
    completedYesterday, completedToday, pending, blockers,
    pendingByBucket, grouping,
    savingId, savedId,
    newTasksText, setNewTasksText, adding,
    toggleTask, deleteTask, moveTaskToBucket, addMoreTasks, reload,
    isViewingToday, bucketLabels,
    duplicateClusters, resolveDuplicateCluster, dismissDuplicateCluster,
  } = useTasksForToday();

  const [dragOverBucket, setDragOverBucket] = useState<Bucket | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [interimVoiceText, setInterimVoiceText] = useState("");

  const renderCheckboxRow = (row: TaskRow) => {
    const isSaving = savingId === row.id;
    const isSaved = savedId === row.id;
    const isDragging = draggingId === row.id;
    return (
      <label
        key={row.id}
        draggable
        onDragStart={(e) => {
          setDraggingId(row.id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", row.id);
        }}
        onDragEnd={() => {
          setDraggingId(null);
          setDragOverBucket(null);
        }}
        className={`flex items-start gap-1.5 cursor-pointer group transition-opacity ${isDragging ? "opacity-40" : ""}`}
      >
        <GripVertical className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing" />
        <Checkbox
          checked={row.completed}
          onCheckedChange={() => toggleTask(row)}
          className="mt-0.5"
          disabled={isSaving}
        />
        <span
          className={`text-sm leading-snug transition-all flex-1 ${
            row.completed ? "line-through text-muted-foreground" : "text-foreground"
          }`}
        >
          <TaskText text={row.task_text} muted={row.completed} />
        </span>
        {isSaving && <Loader2 className="h-3.5 w-3.5 mt-0.5 text-muted-foreground animate-spin shrink-0" />}
        {isSaved && !isSaving && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 shrink-0 animate-fade-in">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteTask(row);
          }}
          disabled={isSaving}
          aria-label="Remove task"
          className="mt-0.5 shrink-0 text-muted-foreground/60 hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </label>
    );
  };

  const renderBucket = (bucket: Bucket, groups: TaskGroup[] | null) => {
    const isOver = dragOverBucket === bucket;
    const hasItems = !!groups && groups.length > 0;
    return (
      <div
        key={bucket}
        onDragOver={(e) => {
          if (!draggingId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOverBucket !== bucket) setDragOverBucket(bucket);
        }}
        onDragLeave={(e) => {
          // Only clear if leaving the bucket entirely
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          if (dragOverBucket === bucket) setDragOverBucket(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData("text/plain");
          const row = pending.find((r) => r.id === id);
          setDragOverBucket(null);
          setDraggingId(null);
          if (row) moveTaskToBucket(row, bucket);
        }}
        className={`rounded-lg border p-3 transition-colors ${
          isOver
            ? "border-primary bg-primary/5"
            : "border-foreground bg-muted/50"
        }`}
      >
        <p className="font-semibold text-sm text-foreground mb-2 flex items-center gap-2">
          {bucketLabels[bucket]}
          {bucket === "today" && grouping && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </p>
        {!hasItems ? (
          <p className="text-xs text-muted-foreground italic py-1">
            {isOver ? "Drop here" : "Drag tasks here"}
          </p>
        ) : (
          <div className="space-y-3">
            {groups!.map((g, gi) => (
              <div key={gi} className="pl-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                  {g.title}
                </p>
                <div className="space-y-1.5">{g.rows.map(renderCheckboxRow)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ─── Completed Yesterday slot ─────────────────────────────────
  if (section === "completedYesterday") {
    if (!isViewingToday || !loaded || completedYesterday.length === 0) return null;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CircleCheckBig className="h-4 w-4" /> Completed Yesterday
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-foreground bg-muted/50 p-3">
            <div className="space-y-1.5">
              {completedYesterday.map((row) => (
                <div key={row.id} className="flex items-start gap-2">
                  <CircleCheckBig className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="text-sm leading-snug text-muted-foreground">
                    <TaskText text={row.task_text} muted />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Completed Today slot ────────────────────────────────────
  if (section === "completedToday") {
    if (!loaded || completedToday.length === 0) return null;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Check className="h-4 w-4" /> Completed Today
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-foreground bg-muted/50 p-3">
            <div className="space-y-1.5">
              {completedToday.map((row) => (
                <label key={row.id} className="flex items-start gap-2 cursor-pointer group">
                  <Checkbox
                    checked={true}
                    onCheckedChange={() => toggleTask(row)}
                    className="mt-0.5"
                    disabled={savingId === row.id}
                  />
                  <span className="text-sm leading-snug line-through text-muted-foreground flex-1">
                    <TaskText text={row.task_text} muted />
                  </span>
                  {savingId === row.id && (
                    <Loader2 className="h-3.5 w-3.5 mt-0.5 text-muted-foreground animate-spin shrink-0" />
                  )}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Default: pending buckets + blockers + add-more ──────────
  const isEmpty = loaded && pending.length === 0 && blockers.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListTodo className="h-5 w-5" /> Tasks
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && !loaded && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {loaded && isEmpty && (
          <p className="text-sm text-muted-foreground py-2">
            No tasks yet. Save an end-of-day entry to populate tomorrow's list, or add tasks below.
          </p>
        )}
        {loaded && !isEmpty && (
          <div className="space-y-3">
            {(["today", "tomorrow", "thisWeek"] as Bucket[]).map((b) =>
              renderBucket(b, pendingByBucket[b])
            )}
            {blockers.length > 0 && (
              <div className="rounded-lg border border-foreground bg-muted/50 p-3">
                <p className="font-semibold text-sm text-foreground mb-2">Blockers & Follow-ups</p>
                <div className="space-y-1.5">{blockers.map(renderCheckboxRow)}</div>
              </div>
            )}
          </div>
        )}
        {loaded && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Plus className="h-4 w-4" /> Add More Tasks
              </label>
              <VoiceInput
                onTranscript={(t) => setNewTasksText((prev) => (prev ? prev + " " + t : t))}
                onInterimTranscript={setInterimVoiceText}
              />
            </div>
            <Textarea
              value={newTasksText}
              onChange={(e) => setNewTasksText(e.target.value)}
              placeholder="Type any extra tasks (free-form). AI will turn them into concise items."
              className="min-h-[60px]"
              disabled={adding}
            />
            {interimVoiceText && (
              <p className="text-sm text-muted-foreground italic px-1">{interimVoiceText}</p>
            )}
            <div className="flex items-center gap-2">
              <Button onClick={addMoreTasks} size="sm" disabled={adding || !newTasksText.trim()}>
                {adding ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Parsing…</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Add tasks</>
                )}
              </Button>
              <Button onClick={reload} variant="ghost" size="sm" disabled={adding || loading}>
                Refresh
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TasksForToday;
