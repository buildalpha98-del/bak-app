"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { TaskCard } from "./task-card";
import type { TaskColumn as TaskColumnType } from "@/lib/types/database";
import type { TaskWithRelations } from "@/lib/types/database";

interface TaskColumnProps {
  column: TaskColumnType;
  tasks: TaskWithRelations[];
  onTaskClick: (taskId: string) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (taskId: string) => void;
}

export function TaskColumn({
  column,
  tasks,
  onTaskClick,
  selectedIds,
  onToggleSelect,
}: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: "column", columnId: column.id },
  });

  const taskIds = tasks.map((t) => t.id);

  return (
    <div
      className={`flex-1 min-w-[280px] max-w-[360px] rounded-2xl border bg-muted/30 transition ${
        isOver ? "border-[#E8712A]/50 bg-[#E8712A]/5" : ""
      } flex flex-col ${column.is_final ? "opacity-70" : ""}`}
    >
      <div className="px-3 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {column.name}
          </h3>
          <span className="text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5 tabular-nums">
            {tasks.length}
          </span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 p-2 overflow-y-auto min-h-[120px]"
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={onTaskClick}
              selected={selectedIds?.has(task.id) ?? false}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}
