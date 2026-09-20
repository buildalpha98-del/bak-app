"use client";

// School portal entry to the shared rating flow: saves as the signed-in
// teacher / school contact (migration 088).

import { saveClientChildRating } from "@/lib/client/assessment-actions";
import {
  AssessmentRatingFlow,
  type RatingFlowTask,
} from "@/components/assessments/assessment-rating-flow";

export function ClientAssessmentsView({
  centreId,
  tasks,
  scopedToClasses,
}: {
  centreId: string;
  tasks: RatingFlowTask[];
  scopedToClasses: boolean;
}) {
  return (
    <AssessmentRatingFlow
      tasks={tasks}
      save={(input) => saveClientChildRating(centreId, input)}
      noun="students"
      showCentreName={false}
      emptyMessage={
        scopedToClasses
          ? "Nothing to assess for your classes this term yet — Build Alpha Kids sets up the skills for each sport at the start of term."
          : "Nothing to assess this term yet — Build Alpha Kids sets up the skills for each sport at the start of term."
      }
    />
  );
}
