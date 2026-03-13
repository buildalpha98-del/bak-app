"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TaskWithRelations } from "@/lib/types/database";
import type { TaskColumn } from "@/lib/types/database";

interface TaskListViewProps {
  tasks: TaskWithRelations[];
  columns: TaskColumn[];
  onTaskClick: (taskId: string) => void;
}

export function TaskListView({
  tasks,
  columns,
  onTaskClick,
}: TaskListViewProps) {
  const priorityColors: Record<string, { bg: string; text: string }> = {
    low: { bg: "bg-gray-100", text: "text-gray-600" },
    medium: { bg: "bg-blue-100", text: "text-blue-700" },
    high: { bg: "bg-amber-100", text: "text-amber-700" },
    urgent: { bg: "bg-red-100", text: "text-red-700" },
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Linked To</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const p = priorityColors[task.priority] ?? priorityColors.medium;
            const isOverdue =
              task.due_date &&
              new Date(task.due_date) <
                new Date(new Date().toISOString().split("T")[0]) &&
              !task.column?.is_final;

            return (
              <TableRow
                key={task.id}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => onTaskClick(task.id)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#1A1A1A] line-clamp-1">
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
                  <span className="text-xs text-[#666666]">
                    {task.column?.name}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${p.bg} ${p.text}`}
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
                        <span className="text-xs text-[#666666]">
                          {task.assignee.name.split(" ")[0]}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {task.due_date ? (
                    <span
                      className={`text-xs ${
                        isOverdue ? "text-red-500 font-medium" : "text-[#666666]"
                      }`}
                    >
                      {isOverdue ? "Overdue: " : ""}
                      {new Date(task.due_date).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {task.linked_entity_name ? (
                    <span className="text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      {task.linked_entity_name}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}

          {tasks.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-gray-400">
                No tasks found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
