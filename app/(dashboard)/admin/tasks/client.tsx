"use client";

// ============================================================
// AdminTasksClient
// ============================================================
//
// Shared client shell for /admin/tasks. Drives:
//   - URL-persisted filter + view state so a filtered board is
//     shareable + refresh-safe (jump-chips from the pulse strip
//     above this view land here via ?overdue=yes / ?mine=yes /
//     ?unassigned=yes / ?due=today)
//   - Active filter chip row with brand-orange tint
//   - View toggle (board / list)
//   - Bulk-select on both views with a sticky action bar (reassign,
//     mark complete, change priority)
//
// Design language mirrors /admin home + centres list refresh:
//   - rounded-2xl containers
//   - restrained brand orange (#E8712A) on active chips + the
//     primary bulk-action button only
//   - gap-6 between major sections

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  Calendar,
  LayoutGrid,
  List,
  Plus,
  Settings,
  User,
  UserX,
  X,
  Users,
  CheckCircle2,
  Flag,
} from "lucide-react";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskListView } from "@/components/tasks/task-list-view";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { ColumnSettingsDialog } from "@/components/tasks/column-settings-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  bulkReassignTasks,
  bulkMarkComplete,
  bulkChangePriority,
} from "@/lib/tasks/actions";
import type { TaskColumn, TaskWithRelations } from "@/lib/types/database";
import type { TaskPriority } from "@/lib/types/enums";
import { TasksStatusPulseStrip } from "@/components/tasks/tasks-status-pulse";
import type { TasksStatusPulse } from "@/lib/tasks/status-pulse-actions";

interface AdminTasksClientProps {
  columns: TaskColumn[];
  initialTasks: TaskWithRelations[];
  teamMembers: { id: string; name: string }[];
  currentUserId: string;
  pulse: TasksStatusPulse;
  basePath: string;
}

type ViewMode = "board" | "list";
type DueFilter = "all" | "today" | "overdue";

export function AdminTasksClient({
  columns,
  initialTasks,
  teamMembers,
  currentUserId,
  pulse,
  basePath,
}: AdminTasksClientProps) {
  const router = useRouter();
  const params = useSearchParams();

  // ============================================================
  // URL-backed filter + view state
  // ============================================================
  //
  // Every filter is mirrored to the query string so a filtered view is
  // shareable + refresh-safe. Default values are NOT serialised so the
  // bare /admin/tasks URL stays clean. `replaceParam` below clears the
  // param when the user returns a filter to its default.

  const view: ViewMode = params.get("view") === "list" ? "list" : "board";
  const assigneeFilter = params.get("assignee") ?? "all";
  const priorityFilter = params.get("priority") ?? "all";
  const categoryFilter = params.get("category") ?? "all";

  // Multiple legacy/pulse-link shapes can all narrow due_date:
  //   ?due=today      → only tasks due today
  //   ?due=overdue    → only overdue tasks
  //   ?overdue=yes    → only overdue tasks (pulse jump-link)
  //   ?mine=yes       → only tasks assigned to the viewer
  //   ?unassigned=yes → only tasks with no assignee
  const dueParam = (params.get("due") as DueFilter | null) ?? "all";
  const overdueJump = params.get("overdue") === "yes";
  const mineJump = params.get("mine") === "yes";
  const unassignedJump = params.get("unassigned") === "yes";

  // ============================================================
  // Setters
  // ============================================================

  const replaceParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(Array.from(params.entries()));
      if (value && value !== "all" && value !== "") {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router],
  );

  // ============================================================
  // Dialog / sheet state
  // ============================================================

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  // ============================================================
  // Bulk-select state
  // ============================================================

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ============================================================
  // Derived list (client-side filter)
  // ============================================================

  const filteredTasks = useMemo(() => {
    const todayIso = new Date().toISOString().split("T")[0];
    return initialTasks.filter((task) => {
      const inFinal = !!task.column?.is_final;

      // Jump-link buckets all skip final-column tasks so the
      // pulse-counts and filtered list agree.
      if (overdueJump) {
        if (!task.due_date || task.due_date >= todayIso || inFinal) return false;
      }
      if (mineJump) {
        if (task.assignee_id !== currentUserId || inFinal) return false;
      }
      if (unassignedJump) {
        if (task.assignee_id !== null || inFinal) return false;
      }

      if (dueParam === "today") {
        if (!task.due_date || task.due_date !== todayIso || inFinal) return false;
      } else if (dueParam === "overdue") {
        if (!task.due_date || task.due_date >= todayIso || inFinal) return false;
      }

      if (assigneeFilter !== "all") {
        if (assigneeFilter === "unassigned") {
          if (task.assignee_id !== null) return false;
        } else if (task.assignee_id !== assigneeFilter) {
          return false;
        }
      }
      if (priorityFilter !== "all" && task.priority !== priorityFilter) {
        return false;
      }
      if (categoryFilter !== "all" && task.column_id !== categoryFilter) {
        return false;
      }
      return true;
    });
  }, [
    initialTasks,
    overdueJump,
    mineJump,
    unassignedJump,
    dueParam,
    assigneeFilter,
    priorityFilter,
    categoryFilter,
    currentUserId,
  ]);

  // When the visible set shrinks (e.g. after a filter narrows the
  // board), drop selections that no longer match so the action bar's
  // count stays honest.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filteredTasks.map((t) => t.id));
      const next = new Set<string>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [filteredTasks]);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedIds(new Set());
        return;
      }
      setSelectedIds(new Set(filteredTasks.map((t) => t.id)));
    },
    [filteredTasks],
  );

  // ============================================================
  // Active chip row — visible whenever any jump or filter is on.
  // ============================================================

  const hasJumpFilter = overdueJump || mineJump || unassignedJump;
  const hasManualFilter =
    assigneeFilter !== "all" ||
    priorityFilter !== "all" ||
    categoryFilter !== "all" ||
    dueParam !== "all";
  const hasAnyFilter = hasJumpFilter || hasManualFilter;

  const assigneeName = (id: string) =>
    teamMembers.find((m) => m.id === id)?.name ?? "Member";
  const columnName = (id: string) =>
    columns.find((c) => c.id === id)?.name ?? "Column";

  const clearAllFilters = () => {
    const next = new URLSearchParams(Array.from(params.entries()));
    [
      "overdue",
      "mine",
      "unassigned",
      "due",
      "assignee",
      "priority",
      "category",
    ].forEach((k) => next.delete(k));
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Pulse strip */}
      <TasksStatusPulseStrip pulse={pulse} basePath={basePath} />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {filteredTasks.length} of {initialTasks.length} shown
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border bg-background">
            <Button
              variant={view === "board" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => replaceParam("view", null)}
              aria-label="Board view"
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => replaceParam("view", "list")}
              aria-label="List view"
            >
              <List className="size-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setColumnSettingsOpen(true)}>
            <Settings className="size-4" />
            Columns
          </Button>
          <Button size="sm" onClick={() => setCreateTaskOpen(true)}>
            <Plus className="size-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* Active jump-filter chips */}
      {hasAnyFilter && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {overdueJump && (
            <JumpChip
              icon={AlertCircle}
              label="Overdue"
              onClear={() => replaceParam("overdue", null)}
            />
          )}
          {mineJump && (
            <JumpChip
              icon={User}
              label="Mine"
              onClear={() => replaceParam("mine", null)}
            />
          )}
          {unassignedJump && (
            <JumpChip
              icon={UserX}
              label="Unassigned"
              onClear={() => replaceParam("unassigned", null)}
            />
          )}
          {dueParam === "today" && (
            <JumpChip
              icon={Calendar}
              label="Due today"
              onClear={() => replaceParam("due", null)}
            />
          )}
          {dueParam === "overdue" && !overdueJump && (
            <JumpChip
              icon={AlertCircle}
              label="Overdue"
              onClear={() => replaceParam("due", null)}
            />
          )}
          {assigneeFilter !== "all" && (
            <JumpChip
              icon={User}
              label={
                assigneeFilter === "unassigned"
                  ? "Unassigned"
                  : assigneeName(assigneeFilter)
              }
              onClear={() => replaceParam("assignee", null)}
            />
          )}
          {priorityFilter !== "all" && (
            <JumpChip
              icon={Flag}
              label={`Priority: ${priorityFilter}`}
              onClear={() => replaceParam("priority", null)}
            />
          )}
          {categoryFilter !== "all" && (
            <JumpChip
              icon={LayoutGrid}
              label={columnName(categoryFilter)}
              onClear={() => replaceParam("category", null)}
            />
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={clearAllFilters}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          value={priorityFilter}
          onValueChange={(v) => replaceParam("priority", v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={assigneeFilter}
          onValueChange={(v) => replaceParam("assignee", v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All assignees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {teamMembers.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={categoryFilter}
          onValueChange={(v) => replaceParam("category", v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {columns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={dueParam}
          onValueChange={(v) => replaceParam("due", v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All due dates" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any due date</SelectItem>
            <SelectItem value="today">Due today</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {view === "board" ? (
        <TaskBoard
          initialTasks={filteredTasks}
          columns={columns}
          userRole="admin"
          currentUserId={currentUserId}
          externalCreateOpen={createTaskOpen}
          onExternalCreateOpenChange={setCreateTaskOpen}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      ) : (
        <>
          <TaskListView
            tasks={filteredTasks}
            columns={columns}
            onTaskClick={(id) => setSelectedTaskId(id)}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
          <TaskDetailSheet
            taskId={selectedTaskId}
            open={!!selectedTaskId}
            onClose={() => setSelectedTaskId(null)}
            userRole="admin"
            currentUserId={currentUserId}
          />
        </>
      )}

      <ColumnSettingsDialog
        columns={columns}
        open={columnSettingsOpen}
        onOpenChange={setColumnSettingsOpen}
        onUpdate={() => window.location.reload()}
      />

      {/* Sticky bulk-action bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          onClear={clearSelection}
          teamMembers={teamMembers}
          onCompleted={() => {
            clearSelection();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// JumpChip — small reusable filter pill
// ============================================================

function JumpChip({
  icon: Icon,
  label,
  onClear,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2.5 py-1 text-xs font-medium text-[#E8712A]">
      <Icon className="size-3" />
      {label}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full p-0.5 hover:bg-[#E8712A]/20"
        aria-label={`Clear ${label} filter`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

// ============================================================
// BulkActionBar — fixed bottom-right, brand-orange ring
// ============================================================

function BulkActionBar({
  selectedIds,
  onClear,
  teamMembers,
  onCompleted,
}: {
  selectedIds: string[];
  onClear: () => void;
  teamMembers: { id: string; name: string }[];
  onCompleted: () => void;
}) {
  const count = selectedIds.length;
  const [reassignOpen, setReassignOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [pendingAssignee, setPendingAssignee] = useState<string>("unassign");
  const [pendingPriority, setPendingPriority] = useState<TaskPriority>("medium");
  const [reassignWorking, setReassignWorking] = useState(false);
  const [priorityWorking, setPriorityWorking] = useState(false);
  const [completeWorking, setCompleteWorking] = useState(false);

  async function handleReassign() {
    setReassignWorking(true);
    try {
      const assigneeId =
        pendingAssignee === "unassign" ? null : pendingAssignee;
      const { updated, error } = await bulkReassignTasks(selectedIds, assigneeId);
      if (error && updated === 0) {
        toast.error(error);
        return;
      }
      if (error) toast.warning(error);
      else
        toast.success(
          `Reassigned ${updated} task${updated === 1 ? "" : "s"}.`,
        );
      setReassignOpen(false);
      onCompleted();
    } finally {
      setReassignWorking(false);
    }
  }

  async function handleComplete() {
    setCompleteWorking(true);
    try {
      const { updated, error } = await bulkMarkComplete(selectedIds);
      if (error && updated === 0) {
        toast.error(error);
        return;
      }
      if (error) toast.warning(error);
      else
        toast.success(
          `Marked ${updated} task${updated === 1 ? "" : "s"} complete.`,
        );
      setCompleteOpen(false);
      onCompleted();
    } finally {
      setCompleteWorking(false);
    }
  }

  async function handleChangePriority() {
    setPriorityWorking(true);
    try {
      const { updated, error } = await bulkChangePriority(
        selectedIds,
        pendingPriority,
      );
      if (error && updated === 0) {
        toast.error(error);
        return;
      }
      if (error) toast.warning(error);
      else
        toast.success(
          `Updated ${updated} task${updated === 1 ? "" : "s"} → ${pendingPriority}.`,
        );
      setPriorityOpen(false);
      onCompleted();
    } finally {
      setPriorityWorking(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-[#E8712A]/40 bg-background px-4 py-3 shadow-lg ring-1 ring-[#E8712A]/20 sm:bottom-6 sm:right-6">
        <div className="flex items-center gap-3 pr-2 text-sm">
          <span className="font-medium text-foreground">
            {count} task{count === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={onClear}
          >
            Clear
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setReassignOpen(true)}
        >
          <Users className="size-4" />
          Reassign
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPriorityOpen(true)}
        >
          <Flag className="size-4" />
          Change priority
        </Button>
        <Button
          size="sm"
          onClick={() => setCompleteOpen(true)}
          className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
        >
          <CheckCircle2 className="size-4" />
          Mark complete
        </Button>
      </div>

      {/* Reassign sheet */}
      <Sheet open={reassignOpen} onOpenChange={setReassignOpen}>
        <SheetContent className="flex w-full max-w-md flex-col">
          <SheetHeader>
            <SheetTitle>Reassign {count} task{count === 1 ? "" : "s"}</SheetTitle>
            <SheetDescription>
              Pick a new owner — or unassign — and each task will be
              re-routed with a notification to the new assignee.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 px-4">
            <div className="space-y-2">
              <Label>Assign to</Label>
              <Select
                value={pendingAssignee}
                onValueChange={(v) => setPendingAssignee(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassign">Unassign</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setReassignOpen(false)}
              disabled={reassignWorking}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReassign}
              disabled={reassignWorking}
              className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
            >
              {reassignWorking ? "Saving…" : "Reassign"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Change priority sheet */}
      <Sheet open={priorityOpen} onOpenChange={setPriorityOpen}>
        <SheetContent className="flex w-full max-w-md flex-col">
          <SheetHeader>
            <SheetTitle>
              Change priority for {count} task{count === 1 ? "" : "s"}
            </SheetTitle>
            <SheetDescription>
              The new priority will apply to every selected task; each
              change is recorded in the task's activity feed.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 px-4">
            <div className="space-y-2">
              <Label>New priority</Label>
              <Select
                value={pendingPriority}
                onValueChange={(v) => setPendingPriority(v as TaskPriority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setPriorityOpen(false)}
              disabled={priorityWorking}
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangePriority}
              disabled={priorityWorking}
              className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
            >
              {priorityWorking ? "Saving…" : "Apply"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Mark complete confirmation */}
      <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark {count} task{count === 1 ? "" : "s"} complete?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each selected task will move to the Done column and the
              original creator will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completeWorking}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleComplete();
              }}
              disabled={completeWorking}
              className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
            >
              {completeWorking ? "Saving…" : "Mark complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
