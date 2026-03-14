import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerNotification } from "@/lib/notifications/send";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// Simple in-memory rate limiter (per-process; sufficient for single-instance)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 }); // 1 hour
    return false;
  }

  entry.count++;
  return entry.count > 10;
}

export async function POST(request: NextRequest) {
  try {
    // CORS
    const origin = request.headers.get("origin") ?? "";
    const allowedOrigins = [
      "https://buildalphakids.com.au",
      "https://www.buildalphakids.com.au",
      "http://localhost:3000",
    ];

    if (origin && !allowedOrigins.includes(origin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Rate limiting
    const headersList = await headers();
    const ip =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headersList.get("x-real-ip") ??
      "unknown";

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Validate required fields
    const { centre_name, contact_name, contact_email, contact_phone, message, type } = body;

    if (!centre_name?.trim()) {
      return NextResponse.json({ error: "Centre/school name is required." }, { status: 400 });
    }
    if (!contact_email?.trim()) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    // Create lead
    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert({
        centre_name: centre_name.trim(),
        type: type === "school" ? "school" : "childcare_centre",
        contact_name: contact_name?.trim() ?? null,
        contact_email: contact_email.trim(),
        contact_phone: contact_phone?.trim() ?? null,
        source: "web_form",
        stage: "cold_lead",
        notes: message?.trim() ?? null,
      })
      .select("id")
      .single();

    if (insertError || !lead) {
      console.error("Enquiry lead creation error:", insertError);
      return NextResponse.json({ error: "Failed to submit enquiry." }, { status: 500 });
    }

    // Create activity
    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      type: "system",
      content: `Enquiry received via website form. Message: ${message?.trim() ?? "(no message)"}`,
    });

    // Notify admin/ops
    const { data: staffUsers } = await supabase
      .from("profiles")
      .select("id, email, name, role")
      .in("role", ["admin", "ops"])
      .eq("status", "active");

    await triggerNotification(
      {
        type: "feedback_received",
        title: `New website enquiry from ${centre_name.trim()}`,
        body: `${contact_name ?? "Unknown"} (${contact_email}) submitted an enquiry via the website.`,
        entityType: "lead",
        entityId: lead.id,
      },
      (staffUsers ?? []).map((s) => ({
        userId: s.id,
        email: s.email,
        name: s.name,
        role: s.role,
      }))
    );

    const response = NextResponse.json({ success: true, message: "Enquiry submitted successfully." });

    // Set CORS headers
    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    }

    return response;
  } catch (err) {
    console.error("Enquiry API error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigins = [
    "https://buildalphakids.com.au",
    "https://www.buildalphakids.com.au",
    "http://localhost:3000",
  ];

  const response = new NextResponse(null, { status: 204 });

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    response.headers.set("Access-Control-Max-Age", "86400");
  }

  return response;
}
