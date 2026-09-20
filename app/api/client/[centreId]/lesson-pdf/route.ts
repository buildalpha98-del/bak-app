import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProgramPdf } from "@/lib/programs/pdf-template";
import type { ProgramContentJson } from "@/lib/ai/types";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";

// A school's own lesson as the printable plan (migration 091). Read
// through the cookie client so RLS decides — a lesson from another
// school simply isn't found.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ centreId: string }> }
) {
  const { centreId } = await params;
  const programId = new URL(request.url).searchParams.get("programId");
  if (!programId) {
    return NextResponse.json({ error: "programId is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: program } = await supabase
    .from("programs")
    .select("id, sport, duration_minutes, age_groups, equipment_used, content_json")
    .eq("id", programId)
    .eq("centre_id", centreId)
    .maybeSingle();
  if (!program) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const raw = program.content_json as Record<string, unknown>;
  const content = {
    ...(raw as unknown as ProgramContentJson),
    title: (raw.title as string) ?? `${program.sport} lesson`,
    sport: (raw.sport as string) ?? program.sport,
    duration: (raw.duration as number) ?? program.duration_minutes,
    objectives: (raw.objectives as string[]) ?? [],
    equipmentNeeded:
      (raw.equipmentNeeded as string[]) ?? (program.equipment_used as string[]) ?? [],
    skillDevelopment: (raw.skillDevelopment as ProgramContentJson["skillDevelopment"]) ?? [],
  } as ProgramContentJson;

  const generatedOn = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: SYDNEY_TZ,
  }).format(new Date());

  const element = React.createElement(ProgramPdf, {
    content,
    ageGroups: (program.age_groups as string[]) ?? [],
    generatedOn,
  }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(element);

  const safeName = content.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName || "lesson"}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
