"use client";

// Coach app entry to the shared rating flow: saves as the signed-in coach.

import { saveChildRating } from "@/lib/assessments/actions";
import {
  AssessmentRatingFlow,
  type RatingFlowTask,
} from "@/components/assessments/assessment-rating-flow";

interface CoachAssessmentViewProps {
  tasks: RatingFlowTask[];
}

export default function CoachAssessmentView({ tasks }: CoachAssessmentViewProps) {
  return <AssessmentRatingFlow tasks={tasks} save={saveChildRating} noun="children" />;
}
