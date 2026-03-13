import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { autoCreateTask } from "@/lib/tasks/auto-create";
import { triggerNotificationForOps } from "@/lib/notifications/send";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, rating, comment } = body as {
      token?: string;
      rating?: number;
      comment?: string;
    };

    // Validate inputs
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Invalid feedback token." },
        { status: 400 }
      );
    }

    if (
      typeof rating !== "number" ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return NextResponse.json(
        { error: "Rating must be a whole number between 1 and 5." },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdmin();

    // Fetch existing feedback record by token
    const { data: existing, error: fetchError } = await admin
      .from("feedback_ratings")
      .select("id, session_id, centre_id, coach_id, sport, submitted_at")
      .eq("feedback_token", token)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Invalid feedback link." },
        { status: 404 }
      );
    }

    if (existing.submitted_at) {
      return NextResponse.json(
        { error: "Feedback has already been submitted." },
        { status: 400 }
      );
    }

    // Update with rating, comment, and submission timestamp
    const { error: updateError } = await admin
      .from("feedback_ratings")
      .update({
        rating,
        comment: comment?.trim() || null,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateError) {
      console.error("Feedback update error:", updateError);
      return NextResponse.json(
        { error: "Failed to submit feedback." },
        { status: 500 }
      );
    }

    // Get centre name for task/notification context
    const { data: centre } = await admin
      .from("centres")
      .select("name")
      .eq("id", existing.centre_id)
      .single();
    const centreName = centre?.name ?? "Unknown Centre";

    // Low rating (1 or 2 stars): auto-create task + urgent notification
    if (rating <= 2) {
      await autoCreateTask({
        title: `Low session rating at ${centreName} — ${rating}/5`,
        description: comment
          ? `Rating: ${rating}/5\nComment: ${comment}`
          : `Rating: ${rating}/5`,
        priority: "high",
        linkedEntityType: "session",
        linkedEntityId: existing.session_id,
        source: "low_session_rating",
      });

      await triggerNotificationForOps({
        type: "low_session_rating",
        title: `Low Session Rating: ${rating}/5`,
        body: `${centreName} rated a session ${rating}/5.${
          comment ? ` Comment: "${comment}"` : ""
        }`,
        entityType: "session",
        entityId: existing.session_id,
      });
    }

    // Positive / neutral feedback: informational notification
    if (rating > 2) {
      await triggerNotificationForOps({
        type: "feedback_received",
        title: "Session Feedback Received",
        body: `${centreName} rated a session ${rating}/5.`,
        entityType: "session",
        entityId: existing.session_id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Feedback submit error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
