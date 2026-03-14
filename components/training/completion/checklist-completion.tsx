"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, CheckSquare, ClipboardList } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { completeModule } from "@/lib/training/completion-actions";
import type {
  TrainingModule,
  TrainingAssignment,
  TrainingCompletion,
  ChecklistContent,
} from "@/lib/types/database";

interface Props {
  module: TrainingModule;
  assignment: TrainingAssignment | null;
  attempts: TrainingCompletion[];
}

interface ChecklistState {
  [itemId: string]: { checked: boolean; note?: string };
}

export function ChecklistCompletion({ module, assignment, attempts }: Props) {
  const content = module.content_json as ChecklistContent;
  const alreadyCompleted = attempts.length > 0;

  const [state, setState] = useState<ChecklistState>({});
  const [completed, setCompleted] = useState(alreadyCompleted);
  const [submitting, setSubmitting] = useState(false);
  const [pathwayInfo, setPathwayInfo] = useState<{
    pathwayComplete?: boolean;
    nextModuleId?: string;
  }>({});

  const allItemsComplete = content.items.every((item) => {
    const entry = state[item.id];
    if (!entry?.checked) return false;
    if (item.requires_note && (!entry.note || entry.note.trim() === ""))
      return false;
    return true;
  });

  const toggleItem = useCallback((itemId: string, checked: boolean) => {
    setState((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], checked },
    }));
  }, []);

  const updateNote = useCallback((itemId: string, note: string) => {
    setState((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], checked: prev[itemId]?.checked ?? false, note },
    }));
  }, []);

  const handleComplete = useCallback(async () => {
    if (!assignment) return;
    setSubmitting(true);
    const result = await completeModule(assignment.id, module.id, {
      passed: true,
      completion_data: state,
    });
    if ("success" in result) {
      setCompleted(true);
      setPathwayInfo({
        pathwayComplete: result.pathwayComplete,
        nextModuleId: result.nextModuleId,
      });
    }
    setSubmitting(false);
  }, [assignment, module.id, state]);

  if (completed) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h2 className="text-xl font-semibold text-foreground">
            Checklist Completed
          </h2>
          <p className="text-sm text-muted-foreground">
            {alreadyCompleted && !pathwayInfo.pathwayComplete
              ? "You have already completed this checklist."
              : "Well done — you've finished this checklist module."}
          </p>
          {pathwayInfo.pathwayComplete && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 mt-4">
              <p className="font-semibold text-emerald-700">
                Congratulations — you&apos;ve completed the pathway!
              </p>
            </div>
          )}
          {pathwayInfo.nextModuleId && (
            <Link
              href={`/coach/training/${pathwayInfo.nextModuleId}`}
              className={cn(buttonVariants(), "mt-2")}
            >
              Continue to Next Module
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <ClipboardList className="h-4 w-4" />
        <span className="text-xs">
          {Object.values(state).filter((s) => s.checked).length} of{" "}
          {content.items.length} items completed
        </span>
      </div>

      {content.items.map((item, idx) => {
        const entry = state[item.id];
        const isChecked = entry?.checked ?? false;

        return (
          <Card key={item.id}>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`item-${item.id}`}
                  checked={isChecked}
                  onCheckedChange={(checked) =>
                    toggleItem(item.id, checked === true)
                  }
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor={`item-${item.id}`}
                    className="text-sm font-medium leading-relaxed"
                  >
                    <span className="text-muted-foreground mr-1.5">
                      {idx + 1}.
                    </span>
                    {item.title}
                  </Label>
                  {item.description && (
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </div>
                {isChecked && (
                  <CheckSquare className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                )}
              </div>

              {item.requires_note && isChecked && (
                <Textarea
                  placeholder="Add a note..."
                  value={entry?.note ?? ""}
                  onChange={(e) => updateNote(item.id, e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              )}
            </CardContent>
          </Card>
        );
      })}

      <Button
        onClick={handleComplete}
        disabled={!allItemsComplete || submitting || !assignment}
        className="w-full"
      >
        {submitting ? "Submitting..." : "Complete Checklist"}
      </Button>
    </div>
  );
}
