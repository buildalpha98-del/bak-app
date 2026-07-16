"use client";

import { useState, useCallback } from "react";
import Link from "@/components/ui/app-link";
import { CheckCircle2, FileText, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { completeModule } from "@/lib/training/completion-actions";
import type {
  TrainingModule,
  TrainingAssignment,
  TrainingCompletion,
  DocumentContent,
} from "@/lib/types/database";

interface Props {
  module: TrainingModule;
  assignment: TrainingAssignment | null;
  attempts: TrainingCompletion[];
}

export function DocumentCompletion({ module, assignment, attempts }: Props) {
  const content = module.content_json as DocumentContent;
  const alreadyCompleted = attempts.length > 0;

  const [acknowledged, setAcknowledged] = useState(false);
  const [completed, setCompleted] = useState(alreadyCompleted);
  const [submitting, setSubmitting] = useState(false);
  const [pathwayInfo, setPathwayInfo] = useState<{
    pathwayComplete?: boolean;
    nextModuleId?: string;
  }>({});

  const canComplete = content.require_acknowledgement ? acknowledged : true;

  const handleComplete = useCallback(async () => {
    if (!assignment) return;
    setSubmitting(true);
    const result = await completeModule(assignment.id, module.id, {
      passed: true,
      completion_data: { acknowledged: true },
    });
    if ("success" in result) {
      setCompleted(true);
      setPathwayInfo({
        pathwayComplete: result.pathwayComplete,
        nextModuleId: result.nextModuleId,
      });
    }
    setSubmitting(false);
  }, [assignment, module.id]);

  if (completed) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h2 className="text-xl font-semibold text-foreground">
            Module Completed
          </h2>
          <p className="text-sm text-muted-foreground">
            {alreadyCompleted && !pathwayInfo.pathwayComplete
              ? "You have already completed this module."
              : "Well done — you've finished this document module."}
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
      <Card>
        <CardContent className="p-0 overflow-hidden rounded-lg">
          {content.file_type === "pdf" ? (
            <iframe
              src={content.file_url}
              className="w-full h-[70vh] min-h-[400px]"
              title={content.file_name}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <FileText className="h-16 w-16 text-muted-foreground" />
              <div className="text-center space-y-1">
                <p className="font-medium text-foreground">
                  {content.file_name}
                </p>
                <p className="text-xs text-muted-foreground uppercase">
                  {content.file_type} document
                </p>
              </div>
              <a
                href={content.file_url}
                download={content.file_name}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <Download className="mr-2 h-4 w-4" />
                Download Document
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {content.require_acknowledgement && (
        <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/50">
          <Checkbox
            id="acknowledge"
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(checked === true)}
          />
          <Label htmlFor="acknowledge" className="text-sm leading-relaxed">
            I have read and understood this document
          </Label>
        </div>
      )}

      <Button
        onClick={handleComplete}
        disabled={!canComplete || submitting || !assignment}
        className="w-full"
      >
        {submitting
          ? "Submitting..."
          : content.require_acknowledgement
            ? "Acknowledge"
            : "Mark Complete"}
      </Button>
    </div>
  );
}
