"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import type { TaskWithRelations } from "@/lib/types/database";
import type { TaskColumn } from "@/lib/types/database";

interface TaskListViewProps {
  tasks: TaskWithRelations[];
  columns: TaskColumn[];
  onTaskClick: (taskId: string) => void;
  /** When provided, render a leading checkbox column + select-all in
   *  the header. The parent owns the selection state. */
  selectedIds?: Set<string>;
  onToggleSelect?: (taskId: string) => void;
  onToggleSelectAll?: (checked: boolean) => void;
}

// ============================================================
// Aging helpers — mirror task-card.tsx so the list view tints
// identically to the board view.
// ============================================================

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24)));
}

function ageingLeftBorder(daysOld: number, inFinalColumn: boolean): string {
  if (inFinalColumn) return "";
  if (daysOld >= 14) return "border-l-2 border-l-[#E8712A]/60";
  if (daysOld >= 7) return "border-l-2 border-l-amber-400/70";
  return "";
}

export function TaskListView({
  tasks,
  columns: _columns,
  onTaskClick,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: TaskListViewProps) {
  // Restrained priority palette — only "urgent" reaches brand orange.
  const priorityClass: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-blue-50 text-blue-700",
    high: "bg-amber-50 text-amber-700",
    urgent: "bg-[#E8712A]/10 text-[#E8712A]",
  };

  const selectable = !!onToggleSelect;
  const allVisibleIds = tasks.map((t) => t.id);
  const allVisibleSelected =
    selectable &&
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedIds?.has(id));

  return (
    <div className="rounded-2xl border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-[36px]">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) =>
                    onToggleSelectAll?.(checked === true)
                  }
                  aria-label="Select all visible tasks"
                />
              </TableHead>
            )}
            <TableHead className="w-[36%]">Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Linked To</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const p = priorityClass[task.priority] ?? priorityClass.medium;
            const inFinal = !!task.column?.is_final;
            const isOverdue =
              task.due_date &&
              new Date(task.due_date) <
                new Date(new Date().toISOString().split("T")[0]) &&
              !inFinal;
            const age = daysSince(task.updated_at);
            const isSelected = selectedIds?.has(task.id) ?? false;

            return (
              <TableRow
                key={task.id}
                data-state={isSelected ? "selected" : undefined}
                className={`cursor-pointer hover:bg-muted/40 ${ageingLeftBorder(age, inFinal)}`}
                onClick={(e) => {
                  // Don't open the detail sheet when the click came
                  // from the checkbox cell.
                  const target = e.target as HTMLElement;
                  if (target.closest("[data-row-checkbox]")) return;
                  onTaskClick(task.id);
                }}
              >
                {selectable && (
                  <TableCell data-row-checkbox onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect?.(task.id)}
                      aria-label={`Select ${task.title}`}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground line-clamp-1">
                      {task.title}
                    </span>
                    {task.source !== "manual" && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 shrink-0">
                        Auto
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {task.column?.name}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${p}`}
                  >
                    {task.priority}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {task.assignee ? (
                      <>
                        {task.assignee.photo_url ? (
                          <img
                            src={task.assignee.photo_url}
                            alt={task.assignee.name}
                            className="w-5 h-5 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-[#E8712A] text-white text-[10px] font-semibold flex items-center justify-center">
                            {task.assignee.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {task.assignee.name.split(" ")[0]}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {task.due_date ? (
                    <span
                      className={`text-xs ${
                        isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {isOverdue ? "Overdue: " : ""}
                      {new Date(task.due_date).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {!inFinal && age >= 7 ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {age}d
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {task.linked_entity_name ? (
                    <span className="text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      {task.linked_entity_name}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}

          {tasks.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={selectable ? 8 : 7}
                className="text-center py-8 text-muted-foreground"
              >
                No tasks found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
