"use client";

import { useState } from "react";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskFilters, type TaskFilterState } from "@/components/tasks/task-filters";
import { TaskListView } from "@/components/tasks/task-list-view";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { TaskColumn } from "@/lib/types/database";
import type { TaskWithRelations } from "@/lib/types/database";

interface OpsTasksClientProps {
  columns: TaskColumn[];
  initialTasks: TaskWithRelations[];
  teamMembers: { id: string; name: string }[];
  userRole: string;
  currentUserId: string;
}

export function OpsTasksClient({
  columns,
  initialTasks,
  teamMembers,
  userRole,
  currentUserId,
}: OpsTasksClientProps) {
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [filters, setFilters] = useState<TaskFilterState>({
    myTasksOnly: false,
    overdueOnly: false,
    assigneeId: "",
    priority: "",
    columnId: "",
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  // Client-side filtering
  const filteredTasks = initialTasks.filter((task) => {
    if (filters.myTasksOnly && task.assignee_id !== currentUserId) return false;
    if (filters.overdueOnly) {
      const today = new Date().toISOString().split("T")[0];
      if (!task.due_date || task.due_date >= today || task.column?.is_final) return false;
    }
    if (filters.assigneeId && task.assignee_id !== filters.assigneeId) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.columnId && task.column_id !== filters.columnId) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-heading text-foreground">Tasks</h1>
        <Button
          size="sm"
          onClick={() => setCreateTaskOpen(true)}
        >
          <Plus className="w-4 h-4 mr-1" /> New Task
        </Button>
      </div>

      <TaskFilters
        filters={filters}
        onFiltersChange={setFilters}
        columns={columns}
        teamMembers={teamMembers}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {viewMode === "board" ? (
        <TaskBoard
          initialTasks={filteredTasks}
          columns={columns}
          userRole={userRole}
          currentUserId={currentUserId}
          externalCreateOpen={createTaskOpen}
          onExternalCreateOpenChange={setCreateTaskOpen}
        />
      ) : (
        <>
          <TaskListView
            tasks={filteredTasks}
            columns={columns}
            onTaskClick={(id) => setSelectedTaskId(id)}
          />
          <TaskDetailSheet
            taskId={selectedTaskId}
            open={!!selectedTaskId}
            onClose={() => setSelectedTaskId(null)}
            userRole={userRole}
            currentUserId={currentUserId}
          />
        </>
      )}
    </div>
  );
}
