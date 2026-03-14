import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateForecasts } from "@/lib/utils/revenueForecasting";

// Vercel cron: weekly on Monday at 6am AEST
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret or authenticated admin user
    const cronSecret = request.headers.get("authorization");
    const isCron = cronSecret === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron) {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { forecasts, error } = await generateForecasts();

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      generated: forecasts.length,
      monthly: forecasts.filter((f) => f.periodType === "monthly").length,
      quarterly: forecasts.filter((f) => f.periodType === "quarterly").length,
    });
  } catch (err) {
    console.error("Forecast generation error:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
