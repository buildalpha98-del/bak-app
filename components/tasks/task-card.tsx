"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TaskWithRelations } from "@/lib/types/database";

interface TaskCardProps {
  task: TaskWithRelations;
  onClick: (taskId: string) => void;
}

function TaskCardInner({ task, onClick }: TaskCardProps) {
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

  const priorityColors: Record<string, { bg: string; text: string }> = {
    low: { bg: "bg-gray-100", text: "text-gray-600" },
    medium: { bg: "bg-blue-100", text: "text-blue-700" },
    high: { bg: "bg-amber-100", text: "text-amber-700" },
    urgent: { bg: "bg-red-100", text: "text-red-700" },
  };

  const p = priorityColors[task.priority] ?? priorityColors.medium;

  const isOverdue =
    task.due_date &&
    new Date(task.due_date) < new Date(new Date().toISOString().split("T")[0]) &&
    !task.column?.is_final;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(task.id)}
      className="bg-white border border-gray-200 rounded-lg p-3 mb-2 cursor-grab active:cursor-grabbing hover:border-gray-300 hover:shadow-sm transition-all min-h-[44px]"
    >
      <p className="text-sm font-semibold text-[#1A1A1A] line-clamp-2 mb-2">
        {task.title}
      </p>

      <div className="flex flex-wrap gap-1 mb-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${p.bg} ${p.text}`}>
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
                <div className="w-5 h-5 rounded-full bg-[#E8712A] text-white text-[10px] font-semibold flex items-center justify-center">
                  {task.assignee.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-[11px] text-[#666666]">
                {task.assignee.name.split(" ")[0]}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-gray-400">Unassigned</span>
          )}
        </div>

        {task.due_date && (
          <span
            className={`text-[11px] font-medium ${
              isOverdue ? "text-red-500" : "text-[#666666]"
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
  );
}

export const TaskCard = React.memo(TaskCardInner);
