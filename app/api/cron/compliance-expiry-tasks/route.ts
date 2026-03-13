import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { autoCreateTask } from "@/lib/tasks/auto-create";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();

  // Find compliance docs expiring within 30 days
  const today = new Date();
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const todayStr = today.toISOString().split("T")[0];
  const futureStr = thirtyDaysFromNow.toISOString().split("T")[0];

  const { data: expiringDocs, error } = await admin
    .from("compliance_docs")
    .select("id, user_id, doc_type, expiry_date")
    .eq("status", "verified")
    .gte("expiry_date", todayStr)
    .lte("expiry_date", futureStr);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!expiringDocs || expiringDocs.length === 0) {
    return NextResponse.json({ message: "No expiring docs", count: 0 });
  }

  // Create tasks for each expiring doc
  let created = 0;
  let skipped = 0;

  for (const doc of expiringDocs) {
    // Get coach name
    const { data: coach } = await admin
      .from("profiles")
      .select("name")
      .eq("id", doc.user_id)
      .single();

    const docTypeLabel = doc.doc_type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    const result = await autoCreateTask({
      title: `Renew ${docTypeLabel}: ${coach?.name ?? "Unknown"}`,
      description: `${docTypeLabel} expires on ${doc.expiry_date}. Please renew before expiry.`,
      assigneeId: doc.user_id,
      priority: "medium",
      linkedEntityType: "profile",
      linkedEntityId: doc.user_id,
      source: "compliance_expiry",
    });

    if (result.data) {
      created++;
    } else {
      skipped++;
    }
  }

  return NextResponse.json({
    message: "Compliance expiry tasks processed",
    expiringDocs: expiringDocs.length,
    tasksCreated: created,
    tasksSkipped: skipped,
  });
}
