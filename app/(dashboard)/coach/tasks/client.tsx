"use client";

import { useState } from "react";
import { TaskListView } from "@/components/tasks/task-list-view";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import type { TaskColumn } from "@/lib/types/database";
import type { TaskWithRelations } from "@/lib/types/database";

interface CoachTasksClientProps {
  columns: TaskColumn[];
  tasks: TaskWithRelations[];
  currentUserId: string;
}

export function CoachTasksClient({
  columns,
  tasks,
  currentUserId,
}: CoachTasksClientProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-heading text-foreground">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tasks assigned to you
        </p>
      </div>

      <TaskListView
        tasks={tasks}
        columns={columns}
        onTaskClick={(id) => setSelectedTaskId(id)}
      />

      <TaskDetailSheet
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        userRole="coach"
        currentUserId={currentUserId}
      />
    </div>
  );
}
