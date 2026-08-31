"use client";

import { useState, useTransition } from "react";
import {
  Circle,
  Clock,
  CheckCircle2,
  SkipForward,
  XCircle,
  Mail,
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import AppLink from "@/components/ui/app-link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  completeOnboardingStep,
  skipOnboardingStep,
} from "@/lib/onboarding/actions";
import type {
  CentreOnboardingChecklist,
  CentreOnboardingStep,
  CentreOnboardingEmail,
} from "@/lib/types/database";

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-5 shrink-0 text-green-600" />;
    case "in_progress":
      return <Clock className="size-5 shrink-0 text-amber-500" />;
    case "skipped":
      return <SkipForward className="size-5 shrink-0 text-muted-foreground" />;
    case "failed":
      return <XCircle className="size-5 shrink-0 text-red-500" />;
    default:
      return <Circle className="size-5 shrink-0 text-muted-foreground/30" />;
  }
}

function statusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "in_progress":
      return "secondary";
    case "stalled":
      return "destructive";
    default:
      return "outline";
  }
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ============================================================
// Step Row Component
// ============================================================

function StepRow({
  step,
  emails,
}: {
  step: CentreOnboardingStep;
  emails: CentreOnboardingEmail[];
}) {
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [showSkip, setShowSkip] = useState(false);

  const isActionable =
    step.step_type === "manual" &&
    (step.status === "pending" || step.status === "in_progress");

  const stepEmails = emails.filter((e) => e.step_number === step.step_number);
  const isEmailStep = step.step_type === "auto_email";
  const isDone = step.status === "completed" || step.status === "skipped";

  function handleComplete() {
    startTransition(async () => {
      const result = await completeOnboardingStep(step.id, notes || undefined);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`Step ${step.step_number} completed.`);
        setNotes("");
        setExpanded(false);
      }
    });
  }

  function handleSkip() {
    if (!skipReason.trim()) {
      toast.error("Please provide a reason for skipping.");
      return;
    }
    startTransition(async () => {
      const result = await skipOnboardingStep(step.id, skipReason.trim());
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`Step ${step.step_number} skipped.`);
        setSkipReason("");
        setShowSkip(false);
        setExpanded(false);
      }
    });
  }

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        isDone ? "bg-muted/30" : "bg-background"
      }`}
    >
      {/* Main row */}
      <div className="flex items-center gap-3">
        {statusIcon(step.status)}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {step.step_number}.
            </span>
            <span
              className={`text-sm font-medium ${
                isDone ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {step.step_name}
            </span>
            {isEmailStep && (
              <Mail className="size-3.5 text-muted-foreground" />
            )}
            {/* The import step lives on the centre page (Classes tab
                for schools, Children tab for childcare) — one level up
                from this /centres/[id]/onboarding route. */}
            {step.step_number === 5 && !isDone && (
              <AppLink
                href="."
                className="text-xs font-medium text-primary hover:underline"
              >
                Open centre page
              </AppLink>
            )}
          </div>

          {/* Completed info */}
          {step.status === "completed" && step.completed_at && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Completed {formatDateTime(step.completed_at)}
            </p>
          )}
          {step.status === "skipped" && step.notes && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Skipped: {step.notes}
            </p>
          )}

          {/* Email step info */}
          {isEmailStep && stepEmails.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {stepEmails.map((email) => (
                <p key={email.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Send className="size-3" />
                  Sent to {email.sent_to}
                  {email.sent_at && <> on {formatDate(email.sent_at)}</>}
                  {email.opened_at && (
                    <span className="text-green-600"> (opened)</span>
                  )}
                </p>
              ))}
            </div>
          )}
          {isEmailStep && stepEmails.length === 0 && step.scheduled_for && step.status === "pending" && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Scheduled for {formatDate(step.scheduled_for)}
            </p>
          )}
        </div>

        {/* Actions */}
        {(isActionable || (isEmailStep && !isDone)) && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
        )}
      </div>

      {/* Expanded actions */}
      {expanded && isActionable && (
        <div className="mt-3 space-y-3 pl-8">
          {!showSkip ? (
            <>
              <Textarea
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleComplete}
                  disabled={isPending}
                >
                  {isPending && <Loader2 className="size-3.5 animate-spin" />}
                  Complete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSkip(true)}
                  disabled={isPending}
                >
                  Skip
                </Button>
              </div>
            </>
          ) : (
            <>
              <Textarea
                placeholder="Reason for skipping (required)"
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleSkip}
                  disabled={isPending}
                >
                  {isPending && <Loader2 className="size-3.5 animate-spin" />}
                  Confirm Skip
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowSkip(false);
                    setSkipReason("");
                  }}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

interface OnboardingChecklistProps {
  centreId: string;
  checklist: CentreOnboardingChecklist;
  steps: CentreOnboardingStep[];
  emails: CentreOnboardingEmail[];
}

export function OnboardingChecklist({
  checklist,
  steps,
  emails,
}: OnboardingChecklistProps) {
  const completedCount = steps.filter(
    (s) => s.status === "completed" || s.status === "skipped"
  ).length;
  const totalSteps = steps.length;
  const progressPercent = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            Onboarding Checklist
          </CardTitle>
          <Badge variant={statusBadgeVariant(checklist.status)}>
            {formatStatus(checklist.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {completedCount} of {totalSteps} steps complete
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Steps list */}
        <div className="space-y-2">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} emails={emails} />
          ))}
        </div>

        {/* Started at info */}
        <p className="text-xs text-muted-foreground">
          Started {formatDateTime(checklist.started_at)}
          {checklist.completed_at && (
            <> &middot; Completed {formatDateTime(checklist.completed_at)}</>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
