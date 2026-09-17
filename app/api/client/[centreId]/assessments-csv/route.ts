import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";

// Assessment results as a spreadsheet — one row per student × skill ×
// term, the shape a PDHPE coordinator pivots in Excel. Reads run
// through the caller's cookie client, so RLS decides every row, same
// trust model as the report downloads.

function csvCell(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ centreId: string }> }
) {
  const { centreId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: centre } = await supabase
    .from("centres")
    .select("name")
    .eq("id", centreId)
    .maybeSingle();
  if (!centre) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: enrolments } = await supabase
    .from("centre_children")
    .select("child_id, children!inner(first_name, last_name)")
    .eq("centre_id", centreId)
    .eq("status", "active");
  const childIds = (enrolments ?? []).map((e) => e.child_id);
  const nameByChild = new Map(
    (enrolments ?? []).map((e) => {
      const c = e.children as unknown as { first_name: string; last_name: string };
      return [e.child_id, `${c.first_name} ${c.last_name}`];
    })
  );

  // Current class labels (empty map for childcare centres).
  const classByChild = new Map<string, string>();
  if (childIds.length > 0) {
    const { data: memberships } = await supabase
      .from("school_class_children")
      .select("child_id, school_classes!inner(name, centre_id)")
      .in("child_id", childIds)
      .is("ended_at", null);
    for (const m of memberships ?? []) {
      const cls = m.school_classes as unknown as { name: string; centre_id: string };
      if (cls.centre_id === centreId) classByChild.set(m.child_id, cls.name);
    }
  }

  const rows: string[] = ["Student,Class,Term,Sport,Skill,Mark (1-5),Assessed"];
  if (childIds.length > 0) {
    const { data: ratings } = await supabase
      .from("skill_ratings")
      .select(
        "child_id, ratings_json, assessed_at, terms!inner(name, start_date), assessment_templates!inner(sport, centre_id)"
      )
      .in("child_id", childIds)
      .order("assessed_at", { ascending: false });

    for (const r of ratings ?? []) {
      const tpl = r.assessment_templates as unknown as {
        sport: string;
        centre_id: string | null;
      };
      if (tpl.centre_id !== null && tpl.centre_id !== centreId) continue;
      const term = r.terms as unknown as { name: string };
      const assessed = new Date(r.assessed_at as string).toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: SYDNEY_TZ,
      });
      for (const skill of (r.ratings_json as { skill_name: string; rating: number }[]) ??
        []) {
        rows.push(
          [
            csvCell(nameByChild.get(r.child_id)),
            csvCell(classByChild.get(r.child_id) ?? ""),
            csvCell(term.name),
            csvCell(tpl.sport),
            csvCell(skill.skill_name),
            csvCell(skill.rating),
            csvCell(assessed),
          ].join(",")
        );
      }
    }
  }

  const safeCentre = centre.name.replace(/[^a-zA-Z0-9]+/g, "-");
  // BOM so Excel opens UTF-8 names correctly.
  return new NextResponse("﻿" + rows.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeCentre}-assessment-results.csv"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
