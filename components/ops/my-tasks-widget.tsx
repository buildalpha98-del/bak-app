"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { WidgetWrapper } from "@/components/ops/widget-wrapper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { markComplete } from "@/lib/tasks/actions";
import type { TaskWithRelations } from "@/lib/types/database";

interface MyTasksWidgetProps {
  tasks: TaskWithRelations[];
  onRefresh: () => void;
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-secondary text-secondary-foreground hover:bg-secondary" },
  medium: { label: "Medium", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  high: { label: "High", className: "bg-amber-100 text-amber-700 hover:bg-amber-100" },
  urgent: { label: "Urgent", className: "bg-red-100 text-red-700 hover:bg-red-100" },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function isOverdue(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export function MyTasksWidget({ tasks, onRefresh }: MyTasksWidgetProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleMarkComplete(taskId: string) {
    setLoadingId(taskId);
    try {
      const result = await markComplete(taskId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Task marked as complete");
        onRefresh();
      }
    } catch {
      toast.error("Failed to complete task");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <WidgetWrapper title="My Tasks" icon={CheckSquare} count={tasks.length}>
      {tasks.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No tasks assigned</p>
      ) : (
        <div className="divide-y divide-border/50">
          {tasks.map((task) => {
            const priority = priorityConfig[task.priority] ?? priorityConfig.low;
            const overdue = task.due_date ? isOverdue(task.due_date) : false;

            return (
              <div
                key={task.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {task.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className={priority.className}>
                      {priority.label}
                    </Badge>
                    {task.due_date && (
                      <span
                        className={`text-xs ${
                          overdue ? "font-semibold text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {overdue && "Overdue \u2022 "}
                        {formatDate(task.due_date)}
                      </span>
                    )}
                    {task.linked_entity_type && (
                      <Badge
                        variant="outline"
                        className="text-xs text-muted-foreground"
                      >
                        {task.linked_entity_type.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={loadingId === task.id}
                  onClick={() => handleMarkComplete(task.id)}
                >
                  {loadingId === task.id ? "..." : "Done"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 border-t border-border pt-3">
        <Link
          href="/ops/tasks"
          className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors duration-200"
        >
          View All
        </Link>
      </div>
    </WidgetWrapper>
  );
}
