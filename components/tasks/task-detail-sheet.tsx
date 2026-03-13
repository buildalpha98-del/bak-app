"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  getTaskDetail,
  updateTask,
  addComment,
  markComplete,
  deleteTask,
  getTeamMembers,
} from "@/lib/tasks/actions";
import type { TaskDetail } from "@/lib/types/database";
import type { TaskPriority } from "@/lib/types/enums";
import {
  CheckCircle2,
  Trash2,
  MessageSquare,
  ArrowRightLeft,
  AlertTriangle,
  User,
  Clock,
} from "lucide-react";

interface TaskDetailSheetProps {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  userRole: string;
  currentUserId: string;
}

export function TaskDetailSheet({
  taskId,
  open,
  onClose,
  userRole,
  currentUserId,
}: TaskDetailSheetProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [teamMembers, setTeamMembers] = useState<
    { id: string; name: string; role: string; photo_url: string | null }[]
  >([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canEdit = userRole === "admin" || userRole === "ops";

  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    const { data } = await getTaskDetail(taskId);
    if (data) setTask(data);
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    if (open && taskId) {
      fetchTask();
      getTeamMembers().then(({ data }) => {
        if (data) setTeamMembers(data);
      });
    }
    return () => {
      setTask(null);
      setConfirmDelete(false);
      setComment("");
    };
  }, [open, taskId, fetchTask]);

  const handleFieldUpdate = async (
    field: string,
    value: string | null
  ) => {
    if (!task) return;
    await updateTask(task.id, { [field]: value });
    fetchTask();
  };

  const handleAddComment = async () => {
    if (!task || !comment.trim()) return;
    setSubmitting(true);
    await addComment(task.id, comment.trim());
    setComment("");
    setSubmitting(false);
    fetchTask();
  };

  const handleMarkComplete = async () => {
    if (!task) return;
    await markComplete(task.id);
    onClose();
    window.location.reload();
  };

  const handleDelete = async () => {
    if (!task) return;
    await deleteTask(task.id);
    onClose();
    window.location.reload();
  };

  const priorityColors: Record<string, string> = {
    low: "text-gray-600",
    medium: "text-blue-700",
    high: "text-amber-700",
    urgent: "text-red-700",
  };

  const activityIcon = (type: string) => {
    switch (type) {
      case "comment":
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case "status_change":
        return <ArrowRightLeft className="w-4 h-4 text-purple-500" />;
      case "assignment_change":
        return <User className="w-4 h-4 text-green-500" />;
      case "priority_change":
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-[#1A1A1A]">Task Details</SheetTitle>
        </SheetHeader>

        {loading || !task ? (
          <div className="space-y-4 mt-6">
            <div className="h-6 bg-gray-100 rounded animate-pulse" />
            <div className="h-20 bg-gray-100 rounded animate-pulse" />
            <div className="h-6 bg-gray-100 rounded animate-pulse w-1/2" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Title */}
            <div>
              {canEdit ? (
                <Input
                  defaultValue={task.title}
                  className="text-lg font-semibold border-0 px-0 focus-visible:ring-0 text-[#1A1A1A]"
                  onBlur={(e) => {
                    if (e.target.value !== task.title) {
                      handleFieldUpdate("title", e.target.value);
                    }
                  }}
                />
              ) : (
                <h2 className="text-lg font-semibold text-[#1A1A1A]">
                  {task.title}
                </h2>
              )}
            </div>

            {/* Source badge */}
            {task.source !== "manual" && (
              <span className="inline-block px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-700 font-medium">
                Auto-created ({task.source.replace(/_/g, " ")})
              </span>
            )}

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-[#666666] uppercase tracking-wide">
                Description
              </label>
              {canEdit ? (
                <Textarea
                  defaultValue={task.description ?? ""}
                  placeholder="Add a description..."
                  className="mt-1"
                  rows={3}
                  onBlur={(e) => {
                    if (e.target.value !== (task.description ?? "")) {
                      handleFieldUpdate("description", e.target.value || null);
                    }
                  }}
                />
              ) : (
                <p className="mt-1 text-sm text-[#1A1A1A]">
                  {task.description || "No description"}
                </p>
              )}
            </div>

            {/* Fields grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Priority */}
              <div>
                <label className="text-xs font-medium text-[#666666] uppercase tracking-wide">
                  Priority
                </label>
                {canEdit ? (
                  <Select
                    defaultValue={task.priority}
                    onValueChange={(v) => handleFieldUpdate("priority", v)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className={`mt-1 text-sm font-medium capitalize ${priorityColors[task.priority] ?? ""}`}>
                    {task.priority}
                  </p>
                )}
              </div>

              {/* Assignee */}
              <div>
                <label className="text-xs font-medium text-[#666666] uppercase tracking-wide">
                  Assignee
                </label>
                {canEdit ? (
                  <Select
                    defaultValue={task.assignee?.id ?? "unassigned"}
                    onValueChange={(v) =>
                      handleFieldUpdate(
                        "assigneeId",
                        v === "unassigned" ? null : v
                      )
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {teamMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="mt-1 text-sm text-[#1A1A1A]">
                    {task.assignee?.name ?? "Unassigned"}
                  </p>
                )}
              </div>

              {/* Due date */}
              <div>
                <label className="text-xs font-medium text-[#666666] uppercase tracking-wide">
                  Due Date
                </label>
                {canEdit ? (
                  <input
                    type="date"
                    defaultValue={task.due_date ?? ""}
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    onChange={(e) =>
                      handleFieldUpdate("dueDate", e.target.value || null)
                    }
                  />
                ) : (
                  <p className="mt-1 text-sm text-[#1A1A1A]">
                    {task.due_date
                      ? new Date(task.due_date).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "No due date"}
                  </p>
                )}
              </div>

              {/* Status */}
              <div>
                <label className="text-xs font-medium text-[#666666] uppercase tracking-wide">
                  Status
                </label>
                <p className="mt-1 text-sm text-[#1A1A1A]">
                  {task.column?.name}
                </p>
              </div>
            </div>

            {/* Linked entity */}
            {task.linked_entity_name && (
              <div>
                <label className="text-xs font-medium text-[#666666] uppercase tracking-wide">
                  Linked To
                </label>
                <p className="mt-1 text-sm text-[#1A1A1A]">
                  <span className="capitalize">
                    {task.linked_entity_type?.replace(/_/g, " ")}
                  </span>
                  : {task.linked_entity_name}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              {!task.column?.is_final && (
                <Button
                  onClick={handleMarkComplete}
                  className="bg-[#E8712A] hover:bg-[#d4661f] text-white"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Mark Complete
                </Button>
              )}

              {canEdit && (
                <>
                  {!confirmDelete ? (
                    <Button
                      variant="outline"
                      onClick={() => setConfirmDelete(true)}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={handleDelete}
                      className="text-red-600 border-red-600 bg-red-50 hover:bg-red-100"
                    >
                      Confirm Delete
                    </Button>
                  )}
                </>
              )}
            </div>

            <Separator />

            {/* Activity Timeline */}
            <div>
              <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3">
                Activity
              </h3>
              <div className="space-y-3">
                {task.activities.map((activity) => (
                  <div key={activity.id} className="flex gap-3">
                    <div className="mt-0.5">{activityIcon(activity.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[#1A1A1A]">
                          {activity.user?.name ?? "System"}
                        </span>
                        <span className="text-[10px] text-[#666666]">
                          {new Date(activity.created_at).toLocaleDateString(
                            "en-AU",
                            {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </span>
                      </div>
                      {activity.type === "comment" ? (
                        <p className="text-sm text-[#1A1A1A] mt-0.5 bg-gray-50 rounded-md p-2">
                          {activity.content}
                        </p>
                      ) : (
                        <p className="text-xs text-[#666666] mt-0.5">
                          {activity.content}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {task.activities.length === 0 && (
                  <p className="text-xs text-gray-400">No activity yet</p>
                )}
              </div>
            </div>

            {/* Comment input */}
            <div className="flex gap-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                rows={2}
                className="flex-1"
              />
              <Button
                onClick={handleAddComment}
                disabled={!comment.trim() || submitting}
                className="bg-[#E8712A] hover:bg-[#d4661f] text-white self-end"
              >
                Add
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
