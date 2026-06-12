import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, ListTodo, CircleCheckBig, Check, Plus, Sparkles, X, GripVertical, AlertTriangle, Info, ChevronRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useTasksForToday, type TaskRow, type TaskGroup, type Bucket } from "./TasksForTodayContext";
import { isTaskImportant } from "@/lib/taskUtils";
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
    toggleTask, deleteTask, moveTaskToBucket, addMoreTasks, reload, setTaskImportant, editTaskText,
    isViewingToday, bucketLabels,
    duplicateClusters, resolveDuplicateCluster, dismissDuplicateCluster,
  } = useTasksForToday();

  const [dragOverBucket, setDragOverBucket] = useState<Bucket | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [interimVoiceText, setInterimVoiceText] = useState("");
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const daysSince = (createdAt?: string) => {
    if (!createdAt) return null;
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) return null;
    const createdDay = new Date(created.getFullYear(), created.getMonth(), created.getDate());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((today.getTime() - createdDay.getTime()) / 86400000);
  };

  const formatAge = (createdAt?: string) => {
    const days = daysSince(createdAt);
    if (days === null) return null;
    if (days < 1) return "today";
    if (days < 7) return `${days}d`;
    if (days < 30) return `${Math.floor(days / 7)}w`;
    return `${Math.floor(days / 30)}mo`;
  };

  const renderCheckboxRow = (row: TaskRow) => {
    const isSaving = savingId === row.id;
    const isSaved = savedId === row.id;
    const isDragging = draggingId === row.id;
    const important = isTaskImportant(row.task_text);
    return (
      <ContextMenu key={row.id}>
        <ContextMenuTrigger asChild>
      <label
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
        {(() => {
          const age = formatAge(row.created_at);
          if (!age) return null;
          const days = daysSince(row.created_at) ?? 0;
          const tone =
            days < 2
              ? "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30"
              : days >= 28
                ? "bg-destructive/15 text-destructive border-destructive/40"
                : days >= 14
                  ? "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30"
                  : days >= 7
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                    : "bg-muted/50 text-muted-foreground border-border";
          return (
            <span
              title={row.created_at ? `Added ${new Date(row.created_at).toLocaleDateString()}` : undefined}
              className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0 text-[10px] leading-4 font-medium tabular-nums ${tone}`}
            >
              {age}
            </span>
          );
        })()}
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
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onSelect={() => setTaskImportant(row, !important)}>
            {important ? "Mark as unimportant" : "Mark as important"}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
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
        {bucket === "backlog" ? (
          <button
            type="button"
            onClick={() => setBacklogOpen((o) => !o)}
            className="w-full font-semibold text-sm text-foreground mb-2 flex items-center gap-2 hover:text-foreground/80 transition-colors"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform duration-200 ${backlogOpen ? "rotate-90" : ""}`}
            />
            {bucketLabels[bucket]}
            {hasItems && (
              <span className="text-xs font-normal text-muted-foreground">
                ({groups!.reduce((n, g) => n + g.rows.length, 0)})
              </span>
            )}
          </button>
        ) : (
          <p className="font-semibold text-sm text-foreground mb-2 flex items-center gap-2">
            {bucketLabels[bucket]}
            {bucket === "today" && grouping && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </p>
        )}
        {bucket === "backlog" && !backlogOpen ? null : !hasItems ? (
          <p className="text-xs text-muted-foreground italic py-1">
            {isOver ? "Drop here" : "Drag tasks here"}
          </p>
        ) : bucket === "backlog" ? (
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
        ) : (
          <div className="space-y-1.5">
            {groups!.flatMap((g) => g.rows).map(renderCheckboxRow)}
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
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Task tips"
                className="text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                <Info className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 text-sm space-y-3">
              <p className="font-semibold text-foreground">Tips for managing tasks</p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground marker:text-muted-foreground/60">
                <li>
                  <span className="font-medium text-foreground">Schedule tasks inline</span> — write phrases like
                  <span className="text-foreground"> "due tomorrow"</span>,
                  <span className="text-foreground"> "this week"</span>, or on Fridays
                  <span className="text-foreground"> "on Monday"</span> /
                  <span className="text-foreground"> "next week"</span> and they'll land in the right bucket.
                </li>
                <li>
                  <span className="font-medium text-foreground">Mark as IMPORTANT</span> — add the word
                  <span className="text-foreground"> IMPORTANT</span> to a task and it'll appear
                  <span className="font-bold text-foreground"> bolded</span> in your list.
                </li>
                <li>
                  <span className="font-medium text-foreground">People recognition</span> — names you mention get a
                  <span className="inline-flex items-center rounded-full border border-primary/60 bg-primary/5 px-1.5 py-0 text-[0.82em] font-medium text-primary mx-1 align-baseline">pill</span>
                  border so it's easy to spot who's involved.
                </li>
                <li>
                  <span className="font-medium text-foreground">Voice input</span> — tap the mic and brain‑dump your tasks naturally; they'll be parsed and grouped for you.
                </li>
              </ul>
            </PopoverContent>
          </Popover>
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
            {duplicateClusters.length > 0 && (
              <div className="space-y-2">
                {duplicateClusters.map((cluster) => (
                  <div
                    key={cluster.key}
                    className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">Possible duplicate</p>
                        {cluster.reason && (
                          <p className="text-xs text-muted-foreground">{cluster.reason}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissDuplicateCluster(cluster.key)}
                        className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
                      >
                        Keep both
                      </button>
                    </div>
                    <div className="space-y-1.5 pl-6">
                      {cluster.rows.map((row) => (
                        <div key={row.id} className="flex items-start gap-2">
                          <span className="text-sm leading-snug text-foreground flex-1">
                            <TaskText text={row.task_text} />
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs shrink-0"
                            onClick={() => resolveDuplicateCluster(cluster.key, row.id)}
                          >
                            Keep this one
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(["backlog", "today", "tomorrow", "thisWeek"] as Bucket[]).map((b) =>
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
