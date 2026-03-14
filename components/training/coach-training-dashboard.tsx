"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  BookOpen,
  CheckCircle2,
  Video,
  FileText,
  HelpCircle,
  CheckSquare,
  GraduationCap,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import type {
  TrainingAssignment,
  TrainingModule,
  TrainingPathway,
  TrainingCompletion,
} from "@/lib/types/database";

type DashboardAssignment = TrainingAssignment & {
  module?: TrainingModule;
  pathway?: TrainingPathway;
  pathway_progress?: { completed: number; total: number };
};

type CompletedAssignment = TrainingAssignment & {
  module?: TrainingModule;
  pathway?: TrainingPathway;
  completion?: TrainingCompletion;
};

interface CoachTrainingDashboardProps {
  assigned: DashboardAssignment[];
  inProgress: DashboardAssignment[];
  completed: CompletedAssignment[];
}

function getModuleTypeIcon(type: string) {
  switch (type) {
    case "video":
      return <Video className="h-5 w-5 text-purple-600" />;
    case "document":
      return <FileText className="h-5 w-5 text-blue-600" />;
    case "quiz":
      return <HelpCircle className="h-5 w-5 text-amber-600" />;
    case "checklist":
      return <CheckSquare className="h-5 w-5 text-green-600" />;
    default:
      return <BookOpen className="h-5 w-5 text-muted-foreground" />;
  }
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─────────────────────────────────────────────
// ASSIGNMENT CARD
// ─────────────────────────────────────────────

function AssignmentCard({
  assignment,
  showCompletion = false,
}: {
  assignment: DashboardAssignment | CompletedAssignment;
  showCompletion?: boolean;
}) {
  const isModule = !!assignment.module;
  const isPathway = !!assignment.pathway;
  const title = assignment.module?.title ?? assignment.pathway?.title ?? "Unknown";
  const category =
    assignment.module?.category ?? assignment.pathway?.category ?? "";
  const overdue =
    !showCompletion && isOverdue(assignment.due_date);

  const href = isModule && assignment.module_id
    ? `/coach/training/${assignment.module_id}`
    : undefined;

  const content = (
    <Card
      className={`transition-all hover:shadow-md ${
        overdue ? "border-red-400 border-2" : ""
      }`}
    >
      <CardContent className="flex items-center gap-4 p-4">
        {/* Icon */}
        <div className="flex-shrink-0">
          {isPathway ? (
            <GraduationCap className="h-5 w-5 text-indigo-600" />
          ) : (
            getModuleTypeIcon(assignment.module?.type ?? "")
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-sm truncate">{title}</h3>
            {category && (
              <Badge variant="secondary" className="text-xs capitalize">
                {category.replace(/_/g, " ")}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {/* Estimated time or pathway progress */}
            {isModule && assignment.module?.estimated_minutes && (
              <span>{assignment.module.estimated_minutes} min</span>
            )}
            {isPathway &&
              (assignment as DashboardAssignment).pathway_progress && (
                <span>
                  {(assignment as DashboardAssignment).pathway_progress!.completed} of{" "}
                  {(assignment as DashboardAssignment).pathway_progress!.total} modules
                </span>
              )}

            {/* Due date */}
            {assignment.due_date && !showCompletion && (
              <span className={overdue ? "text-red-600 font-semibold" : ""}>
                {overdue && (
                  <AlertTriangle className="inline h-3 w-3 mr-1" />
                )}
                {overdue ? "Overdue" : `Due ${formatDate(assignment.due_date)}`}
              </span>
            )}

            {/* Completion info */}
            {showCompletion && (assignment as CompletedAssignment).completion && (
              <>
                <span>
                  Completed{" "}
                  {formatDate(
                    (assignment as CompletedAssignment).completion!.completed_at
                  )}
                </span>
                {(assignment as CompletedAssignment).completion!.score != null && (
                  <span>
                    Score:{" "}
                    {(assignment as CompletedAssignment).completion!.score}%
                  </span>
                )}
              </>
            )}

            {showCompletion &&
              !(assignment as CompletedAssignment).completion &&
              assignment.completed_at && (
                <span>Completed {formatDate(assignment.completed_at)}</span>
              )}
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

// ─────────────────────────────────────────────
// SECTION
// ─────────────────────────────────────────────

function Section({
  title,
  icon,
  items,
  emptyMessage,
  showCompletion = false,
}: {
  title: string;
  icon: React.ReactNode;
  items: Array<DashboardAssignment | CompletedAssignment>;
  emptyMessage: string;
  showCompletion?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge variant="secondary" className="ml-auto">
          {items.length}
        </Badge>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <AssignmentCard
              key={item.id}
              assignment={item}
              showCompletion={showCompletion}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export function CoachTrainingDashboard({
  assigned,
  inProgress,
  completed,
}: CoachTrainingDashboardProps) {
  return (
    <div className="space-y-8">
      <Section
        title="In Progress"
        icon={<Clock className="h-5 w-5 text-blue-600" />}
        items={inProgress}
        emptyMessage="No training in progress."
      />

      <Section
        title="Assigned"
        icon={<BookOpen className="h-5 w-5 text-amber-600" />}
        items={assigned}
        emptyMessage="No new training assigned."
      />

      <Section
        title="Completed"
        icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
        items={completed}
        emptyMessage="No completed training yet."
        showCompletion
      />
    </div>
  );
}
