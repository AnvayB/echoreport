import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, ListTodo, CircleCheckBig, Check, Plus, Sparkles, X, GripVertical, AlertTriangle, Info, ChevronRight, RefreshCw, Dices,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
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
    completedYesterday, completedYesterdayDate, completedToday, pending, blockers,
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
  const [diceOpen, setDiceOpen] = useState(false);
  const [editingGroupTitle, setEditingGroupTitle] = useState<string | null>(null); // key = `${bucket}:${gi}`
  const [editingGroupText, setEditingGroupText] = useState("");
  const [groupTitleOverrides, setGroupTitleOverrides] = useState<Record<string, string>>({});
  const [randomTask, setRandomTask] = useState<TaskRow | null>(null);

  const rollRandomTask = () => {
    if (pending.length === 0) {
      setRandomTask(null);
      return;
    }
    if (pending.length === 1) {
      setRandomTask(pending[0]);
      return;
    }
    let next = pending[Math.floor(Math.random() * pending.length)];
    // avoid repeating the same one back-to-back
    let guard = 0;
    while (randomTask && next.id === randomTask.id && guard < 10) {
      next = pending[Math.floor(Math.random() * pending.length)];
      guard++;
    }
    setRandomTask(next);
  };

  const openDice = () => {
    rollRandomTask();
    setDiceOpen(true);
  };

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
    const isEditing = editingId === row.id;

    const startEdit = () => {
      setEditingId(row.id);
      setEditingText(row.task_text);
    };

    const cancelEdit = () => {
      setEditingId(null);
      setEditingText("");
    };

    const saveEdit = async () => {
      await editTaskText(row, editingText);
      setEditingId(null);
      setEditingText("");
    };

    return (
      <ContextMenu key={row.id}>
        <ContextMenuTrigger asChild>
          <label
            draggable={!isEditing}
            onDragStart={(e) => {
              if (isEditing) return;
              setDraggingId(row.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", row.id);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setDragOverBucket(null);
            }}
            className={`flex items-start gap-1.5 cursor-pointer group transition-opacity ${isDragging ? "opacity-40" : ""} ${isEditing ? "cursor-default" : ""}`}
          >
            <GripVertical className={`h-3.5 w-3.5 mt-0.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing ${isEditing ? "opacity-0 pointer-events-none" : ""}`} />
            <Checkbox
              checked={row.completed}
              onCheckedChange={() => toggleTask(row)}
              className="mt-0.5"
              disabled={isSaving || isEditing}
            />
            {isEditing ? (
              <div className="flex-1 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                <Textarea
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  className="min-h-[40px] text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      saveEdit();
                    }
                    if (e.key === "Escape") {
                      cancelEdit();
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={saveEdit} disabled={!editingText.trim() || editingText.trim() === row.task_text}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                </div>
              </div>
            ) : (
              <span
                className={`text-sm leading-snug transition-all flex-1 ${
                  row.completed ? "line-through text-muted-foreground" : "text-foreground"
                }`}
              >
                <TaskText text={row.task_text} muted={row.completed} />
              </span>
            )}
            {isSaving && <Loader2 className="h-3.5 w-3.5 mt-0.5 text-muted-foreground animate-spin shrink-0" />}
            {isSaved && !isSaving && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 shrink-0 animate-fade-in">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
            {!isEditing && (() => {
              const age = formatAge(row.created_at);
              if (!age) return null;
              const days = daysSince(row.created_at) ?? 0;
              const tone =
                days <= 3
                  ? "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30"
                  : days >= 60
                    ? "bg-[#5a1a1a]/15 text-[#7a1f1f] dark:text-[#c76b6b] border-[#7a1f1f]/40"
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
            {!isEditing && (
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
            )}
          </label>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onSelect={() => setTaskImportant(row, !important)}>
            {important ? "Mark as unimportant" : "Mark as important"}
          </ContextMenuItem>
          <ContextMenuItem onSelect={startEdit}>Edit text</ContextMenuItem>
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
            {hasItems && (
              <span className="text-xs font-normal text-muted-foreground">
                ({groups!.reduce((n, g) => n + g.rows.length, 0)})
              </span>
            )}
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
            {groups!.map((g, gi) => {
              const titleKey = `${bucket}:${gi}`;
              const displayTitle = groupTitleOverrides[titleKey] ?? g.title;
              const isEditingTitle = editingGroupTitle === titleKey;
              return (
                <div key={gi} className="pl-1">
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div>
                        {isEditingTitle ? (
                          <input
                            autoFocus
                            value={editingGroupText}
                            onChange={(e) => setEditingGroupText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (editingGroupText.trim()) setGroupTitleOverrides((o) => ({ ...o, [titleKey]: editingGroupText.trim() }));
                                setEditingGroupTitle(null);
                              } else if (e.key === "Escape") {
                                setEditingGroupTitle(null);
                              }
                            }}
                            onBlur={() => {
                              if (editingGroupText.trim()) setGroupTitleOverrides((o) => ({ ...o, [titleKey]: editingGroupText.trim() }));
                              setEditingGroupTitle(null);
                            }}
                            className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5 bg-transparent border-b border-muted-foreground/40 outline-none w-full"
                          />
                        ) : (
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5 cursor-default">
                            {displayTitle}
                          </p>
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={() => { setEditingGroupText(displayTitle); setEditingGroupTitle(titleKey); }}>
                        Rename group
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                  <div className="space-y-1.5">{g.rows.map(renderCheckboxRow)}</div>
                </div>
              );
            })}
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
    const label = (() => {
      if (!completedYesterdayDate) return "Completed Yesterday";
      // Parse YYYY-MM-DD as a local date (avoid UTC shift).
      const [y, m, d] = completedYesterdayDate.split("-").map(Number);
      const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      const isLiteralYesterday =
        dt.getFullYear() === yest.getFullYear() &&
        dt.getMonth() === yest.getMonth() &&
        dt.getDate() === yest.getDate();
      if (isLiteralYesterday) return "Completed Yesterday";
      const weekday = dt.toLocaleDateString(undefined, { weekday: "long" });
      return `Completed ${weekday}`;
    })();
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CircleCheckBig className="h-4 w-4" /> {label}
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
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
            <PopoverContent align="start" side="bottom" className="w-80 p-3">
              <p className="font-semibold text-foreground text-sm mb-2">Tips for managing tasks</p>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="rightclick" className="border-b-0">
                  <AccordionTrigger className="py-2 text-sm">Right-click any task</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground pb-3">
                    Edit its text, or mark it as important/unimportant. Backlog group titles can also be renamed by right-clicking them.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="schedule" className="border-b-0">
                  <AccordionTrigger className="py-2 text-sm">Schedule tasks inline</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground pb-3">
                    Write phrases like <span className="text-foreground">"due tomorrow"</span>, <span className="text-foreground">"this week"</span>, or on Fridays <span className="text-foreground">"on Monday"</span> / <span className="text-foreground">"next week"</span> and they'll land in the right bucket.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="important" className="border-b-0">
                  <AccordionTrigger className="py-2 text-sm">Mark as IMPORTANT</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground pb-3">
                    Add the word <span className="text-foreground">IMPORTANT</span> to a task and it'll appear <span className="font-bold text-foreground">bolded</span> in your list.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="people" className="border-b-0">
                  <AccordionTrigger className="py-2 text-sm">People recognition</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground pb-3">
                    Names you mention get a <span className="inline-flex items-center rounded-full border border-primary/60 bg-primary/5 px-1.5 py-0 text-[0.82em] font-medium text-primary mx-1 align-baseline">pill</span> border so it's easy to spot who's involved.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="voice" className="border-b-0">
                  <AccordionTrigger className="py-2 text-sm">Voice input</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground pb-3">
                    Tap the mic and brain-dump your tasks naturally; they'll be parsed and grouped for you.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </PopoverContent>
          </Popover>
        </CardTitle>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openDice}
            disabled={loading || adding || pending.length === 0}
            aria-label="Pick a random task"
            title="Pick a random task"
            className="text-muted-foreground/70 hover:text-foreground transition-colors disabled:opacity-50"
          >
            <Dices className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={reload}
            disabled={loading || adding}
            aria-label="Refresh tasks"
            className={`text-muted-foreground/70 hover:text-foreground transition-colors disabled:opacity-50 ${loading ? "animate-spin" : ""}`}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
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
            </div>
          </div>
        )}
      </CardContent>
      <Dialog open={diceOpen} onOpenChange={setDiceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dices className="h-5 w-5" /> Your random task
            </DialogTitle>
            <DialogDescription>
              Can't decide what to do next? Let the dice pick for you.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-foreground bg-muted/50 p-4 min-h-[80px] flex items-center">
            {randomTask ? (
              <span className="text-base leading-snug text-foreground">
                <TaskText text={randomTask.task_text} />
              </span>
            ) : (
              <span className="text-sm text-muted-foreground italic">
                No pending tasks to pick from.
              </span>
            )}
          </div>
          <DialogFooter className="sm:justify-between gap-2">
            <Button
              variant="outline"
              onClick={rollRandomTask}
              disabled={pending.length < 2}
            >
              <Dices className="h-4 w-4 mr-1.5" /> Re-roll
            </Button>
            <Button
              onClick={() => {
                if (randomTask) moveTaskToBucket(randomTask, "today");
                setDiceOpen(false);
              }}
              disabled={!randomTask}
            >
              Let's do it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TasksForToday;
