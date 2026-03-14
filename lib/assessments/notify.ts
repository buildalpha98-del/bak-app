"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { triggerNotification } from "@/lib/notifications/send";

/**
 * Notify a coach that an assessment is ready for them.
 * Called when ops initiates assessments from the management page.
 */
export async function notifyCoachAssessmentReady(input: {
  coachId: string;
  sport: string;
  centreName: string;
  childCount: number;
  templateId: string;
}): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get coach profile for email
    const { data: coach } = await supabase
      .from("profiles")
      .select("id, email, name, role")
      .eq("id", input.coachId)
      .single();

    if (!coach) return { error: "Coach not found." };

    await triggerNotification(
      {
        type: "assessment_ready",
        title: "Term assessment ready",
        body: `${input.sport} at ${input.centreName} — ${input.childCount} children to assess`,
        entityType: "assessment_template",
        entityId: input.templateId,
        data: {
          sport: input.sport,
          centre_name: input.centreName,
          child_count: input.childCount,
        },
      },
      [
        {
          userId: coach.id,
          email: coach.email,
          name: coach.name,
          role: coach.role,
        },
      ]
    );

    return { error: null };
  } catch (err) {
    console.error("notifyCoachAssessmentReady error:", err);
    return { error: "Failed to send notification." };
  }
}
