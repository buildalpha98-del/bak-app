"use client";

import type {
  TrainingModule,
  TrainingAssignment,
  TrainingCompletion,
} from "@/lib/types/database";
import { VideoCompletion } from "./video-completion";
import { DocumentCompletion } from "./document-completion";
import { QuizCompletion } from "./quiz-completion";
import { ChecklistCompletion } from "./checklist-completion";
import { startModuleProgress } from "@/lib/training/completion-actions";
import { useEffect } from "react";

interface Props {
  module: TrainingModule;
  assignment: TrainingAssignment | null;
  attempts: TrainingCompletion[];
}

export function ModuleCompletionView({ module, assignment, attempts }: Props) {
  // Auto-start progress when coach opens the module
  useEffect(() => {
    if (assignment && assignment.status === "assigned") {
      startModuleProgress(assignment.id);
    }
  }, [assignment]);

  const commonProps = { module, assignment, attempts };

  switch (module.type) {
    case "video":
      return <VideoCompletion {...commonProps} />;
    case "document":
      return <DocumentCompletion {...commonProps} />;
    case "quiz":
      return <QuizCompletion {...commonProps} />;
    case "checklist":
      return <ChecklistCompletion {...commonProps} />;
    default:
      return <p>Unknown module type.</p>;
  }
}
