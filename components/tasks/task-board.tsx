"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { TaskColumn } from "./task-column";
import { TaskCard } from "./task-card";
import { TaskDetailSheet } from "./task-detail-sheet";
import { CreateTaskDialog } from "./create-task-dialog";
import { moveTask } from "@/lib/tasks/actions";
import type { TaskColumn as TaskColumnType } from "@/lib/types/database";
import type { TaskWithRelations } from "@/lib/types/database";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TaskBoardProps {
  initialTasks: TaskWithRelations[];
  columns: TaskColumnType[];
  userRole: string;
  currentUserId: string;
}

export function TaskBoard({
  initialTasks,
  columns,
  userRole,
  currentUserId,
}: TaskBoardProps) {
  const [tasks, setTasks] = useState<TaskWithRelations[]>(initialTasks);
  const [activeTask, setActiveTask] = useState<TaskWithRelations | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Update tasks when initialTasks changes (e.g. after filter or refresh)
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // "N" keyboard shortcut to open create dialog
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (
        e.key === "n" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        setCreateOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const tasksByColumn = useMemo(() => {
    const map: Record<string, TaskWithRelations[]> = {};
    for (const col of columns) {
      map[col.id] = [];
    }
    for (const task of tasks) {
      if (map[task.column_id]) {
        map[task.column_id].push(task);
      }
    }
    // Sort by column_order within each column
    for (const colId of Object.keys(map)) {
      map[colId].sort((a, b) => a.column_order - b.column_order);
    }
    return map;
  }, [tasks, columns]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const task = tasks.find((t) => t.id === event.active.id);
      if (task) setActiveTask(task);
    },
    [tasks]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeTaskId = active.id as string;
      const overId = over.id as string;

      // Determine target column
      let targetColumnId: string | null = null;

      if (overId.startsWith("column-")) {
        targetColumnId = overId.replace("column-", "");
      } else {
        // Over a task — find which column it belongs to
        const overTask = tasks.find((t) => t.id === overId);
        if (overTask) targetColumnId = overTask.column_id;
      }

      if (!targetColumnId) return;

      const activeTaskData = tasks.find((t) => t.id === activeTaskId);
      if (!activeTaskData || activeTaskData.column_id === targetColumnId) return;

      // Optimistically move to new column
      setTasks((prev) =>
        prev.map((t) =>
          t.id === activeTaskId ? { ...t, column_id: targetColumnId! } : t
        )
      );
    },
    [tasks]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;

      const activeTaskId = active.id as string;
      const task = tasks.find((t) => t.id === activeTaskId);
      if (!task) return;

      // Determine target column and position
      let targetColumnId = task.column_id;
      let newOrder = 0;

      const overId = over.id as string;

      if (overId.startsWith("column-")) {
        targetColumnId = overId.replace("column-", "");
        // Dropped on empty column — position 0
        const colTasks = tasks.filter(
          (t) => t.column_id === targetColumnId && t.id !== activeTaskId
        );
        newOrder = colTasks.length;
      } else {
        const overTask = tasks.find((t) => t.id === overId);
        if (overTask) {
          targetColumnId = overTask.column_id;
          newOrder = overTask.column_order;
        }
      }

      // Optimistic update — reorder locally
      setTasks((prev) => {
        const updated = prev.map((t) =>
          t.id === activeTaskId
            ? { ...t, column_id: targetColumnId, column_order: newOrder }
            : t
        );
        return updated;
      });

      // Server action
      const result = await moveTask(activeTaskId, targetColumnId, newOrder);
      if (result.error) {
        // Revert on error
        setTasks(initialTasks);
      }
    },
    [tasks, initialTasks]
  );

  const handleTaskClick = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  const handleTaskCreated = useCallback(() => {
    // Page will revalidate — for now just close the dialog
    setCreateOpen(false);
    // Trigger a page refresh to get the new task from the server
    window.location.reload();
  }, []);

  // Desktop: horizontal columns. Mobile: tabs
  return (
    <>
      {/* Desktop view */}
      <div className="hidden md:flex gap-3 overflow-x-auto pb-4 min-h-[400px]">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {columns.map((col) => (
            <TaskColumn
              key={col.id}
              column={col}
              tasks={tasksByColumn[col.id] ?? []}
              onTaskClick={handleTaskClick}
            />
          ))}

          <DragOverlay>
            {activeTask ? (
              <TaskCard task={activeTask} onClick={() => {}} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Mobile view — tabs */}
      <div className="md:hidden">
        <Tabs defaultValue={columns[0]?.id}>
          <TabsList className="w-full">
            {columns.map((col) => (
              <TabsTrigger key={col.id} value={col.id} className="flex-1 text-xs">
                {col.name} ({tasksByColumn[col.id]?.length ?? 0})
              </TabsTrigger>
            ))}
          </TabsList>

          {columns.map((col) => (
            <TabsContent key={col.id} value={col.id} className="mt-3">
              <div className="space-y-2">
                {(tasksByColumn[col.id] ?? []).map((task) => (
                  <div key={task.id} onClick={() => handleTaskClick(task.id)}>
                    <TaskCard task={task} onClick={handleTaskClick} />
                  </div>
                ))}
                {(tasksByColumn[col.id] ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No tasks
                  </p>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <TaskDetailSheet
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        userRole={userRole}
        currentUserId={currentUserId}
      />

      <CreateTaskDialog
        columns={columns}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleTaskCreated}
      />
    </>
  );
}
