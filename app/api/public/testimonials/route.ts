import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":
    process.env.NODE_ENV === "production"
      ? "https://buildalphakids.com.au"
      : "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = createSupabaseAdmin();

    const { data: testimonials, error } = await supabase
      .from("approved_testimonials")
      .select("display_name, comment, rating, centre_name")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Public testimonials fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch testimonials." },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // Shuffle for random order
    const shuffled = (testimonials ?? []).sort(() => Math.random() - 0.5);

    return NextResponse.json(
      { testimonials: shuffled },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (err) {
    console.error("Public testimonials API error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
