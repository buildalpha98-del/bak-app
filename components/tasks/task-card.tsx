"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import type { TaskWithRelations } from "@/lib/types/database";

interface TaskCardProps {
  task: TaskWithRelations;
  onClick: (taskId: string) => void;
  /** When true, render a select checkbox + show the selected ring. */
  selected?: boolean;
  /** Called when the checkbox is toggled. If omitted, no checkbox shows. */
  onToggleSelect?: (taskId: string) => void;
}

// ============================================================
// Aging tint
// ============================================================
//
// Tasks sitting in a non-final column for too long pick up a left
// border tint: amber from 7 days, brand orange from 14 days. Final
// columns are skipped — "Done" tasks don't need pressure cues.

function ageingBorderClass(daysOld: number, inFinalColumn: boolean): string {
  if (inFinalColumn) return "border-l-2 border-l-transparent";
  if (daysOld >= 14) return "border-l-2 border-l-primary/60";
  if (daysOld >= 7) return "border-l-2 border-l-amber-400/70";
  return "border-l-2 border-l-transparent";
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  const now = Date.now();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

function TaskCardInner({
  task,
  onClick,
  selected = false,
  onToggleSelect,
}: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: "task", task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // ============================================================
  // Priority palette
  // ============================================================
  //
  // Restrained: only "urgent" reaches into brand orange — every other
  // tier stays in calm neutrals/blues so the card doesn't shout when
  // it doesn't need to.
  const priorityClass: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-blue-50 text-blue-700",
    high: "bg-amber-50 text-amber-700",
    urgent: "bg-primary/10 text-primary",
  };
  const p = priorityClass[task.priority] ?? priorityClass.medium;

  const inFinal = !!task.column?.is_final;
  const isOverdue =
    task.due_date &&
    new Date(task.due_date) < new Date(new Date().toISOString().split("T")[0]) &&
    !inFinal;

  const age = daysSince(task.updated_at);
  const showAgeBadge = age >= 7 && !inFinal;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onClick(task.id)}
      className={`group relative mb-2 cursor-grab rounded-2xl border bg-background p-4 transition hover:shadow-md active:cursor-grabbing min-h-[44px] ${ageingBorderClass(
        age,
        inFinal,
      )} ${selected ? "ring-2 ring-primary/40" : ""}`}
    >
      {/* Drag handle wraps the actual card content so the checkbox
          stays clickable without instantly initiating a drag. */}
      <div {...attributes} {...listeners}>
        <p className="text-sm font-semibold text-foreground line-clamp-2 mb-2 pr-6">
          {task.title}
        </p>

        <div className="flex flex-wrap gap-1 mb-2">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${p}`}
          >
            {task.priority}
          </span>

          {task.linked_entity_name && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700">
              {task.linked_entity_name}
            </span>
          )}

          {task.source !== "manual" && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700">
              Auto
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
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
                  <div className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-semibold flex items-center justify-center">
                    {task.assignee.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {task.assignee.name.split(" ")[0]}
                </span>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">Unassigned</span>
            )}
          </div>

          {task.due_date && (
            <span
              className={`text-[11px] font-medium ${
                isOverdue ? "text-red-500" : "text-muted-foreground"
              }`}
            >
              {isOverdue ? "Overdue: " : "Due: "}
              {new Date(task.due_date).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
        </div>
      </div>

      {/* Bulk-select checkbox — top-right. Visible on hover, or
          always when the card is selected, so an in-progress
          selection set never gets visually "stuck" mid-page. */}
      {onToggleSelect && (
        <div
          className={`absolute top-2 right-2 ${
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          } transition-opacity`}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(task.id)}
            aria-label={`Select ${task.title}`}
          />
        </div>
      )}

      {/* Aging "Xd" tag — bottom-right. Only on non-final columns
          past the 7-day mark, so calm cards stay calm. */}
      {showAgeBadge && (
        <span className="absolute bottom-2 right-2 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground tabular-nums">
          {age}d
        </span>
      )}
    </div>
  );
}

export const TaskCard = React.memo(TaskCardInner);
