/**
 * Seed an 8-week programme series for EVERY sport in the taxonomy so
 * the library opens pre-filled — Abdul applies a series to the roster
 * and only builds bespoke programmes when a centre needs something
 * special.
 *
 * - One series per sport (19 sports × 8 weeks = 152 programmes).
 * - Weeks generate SEQUENTIALLY per sport with progression context
 *   (week N sees weeks 1..N-1's titles/objectives/drills), so each
 *   block is a real curriculum, not eight disconnected plans.
 * - Sports run through a small worker pool (3 at a time) to keep API
 *   throughput sane.
 * - Idempotent: a sport is skipped if it already has a week-1 row of
 *   an 8-week series. Safe to re-run after a partial failure — it
 *   finishes only the missing sports.
 *
 * Run with: npx tsx scripts/seed-program-series.ts
 * Requires ANTHROPIC_API_KEY + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (refresh via `vercel env pull .env.local`).
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";
import { randomUUID } from "crypto";

// .env.local wins where it defines a var; the Vercel production pull
// (`vercel env pull .env.production.local --environment=production`)
// fills the rest — that's where the Supabase + Anthropic keys live.
dotenv.config({ path: resolve(__dirname, "../.env.local") });
dotenv.config({ path: resolve(__dirname, "../.env.production.local") });

import { generateProgram } from "../lib/ai/generate-program";
import { STANDARD_EQUIPMENT } from "../lib/ai/types";
import { SPORTS } from "../lib/types/enums";
import type { ProgramContentJson } from "../lib/ai/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!supabaseUrl || !serviceRoleKey || !process.env.ANTHROPIC_API_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or ANTHROPIC_API_KEY"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WEEKS = 8;
const AGE_GROUPS = ["3-5", "5-8", "8-12"];
const DURATION_MINUTES = 45;
const CONCURRENT_SPORTS = 3;
// Jayden's admin profile — programmes need a real created_by.
const CREATED_BY = process.env.SEED_CREATED_BY ?? "a2bfaba4-16c9-42bf-9e61-463e1ad1f05e";

function weekTitle(raw: string, week: number): string {
  return /week\s*\d/i.test(raw) ? raw : `${raw} — Week ${week} of ${WEEKS}`;
}

async function sportAlreadySeeded(sport: string): Promise<boolean> {
  const { data } = await supabase
    .from("programs")
    .select("id")
    .eq("sport", sport)
    .eq("series_week", 1)
    .eq("series_length", WEEKS)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function seedSport(sport: string): Promise<void> {
  if (await sportAlreadySeeded(sport)) {
    console.log(`↷  ${sport}: already seeded, skipping`);
    return;
  }

  const seriesId = randomUUID();
  const previousWeeks: Array<{
    week: number;
    title: string;
    objectives: string[];
    skills: string[];
  }> = [];

  for (let week = 1; week <= WEEKS; week++) {
    let content: ProgramContentJson | null = null;
    // One retry per week — a single flaky call shouldn't sink a sport.
    for (let attempt = 1; attempt <= 2 && !content; attempt++) {
      try {
        content = await generateProgram({
          sport,
          ageGroups: AGE_GROUPS,
          durationMinutes: DURATION_MINUTES,
          availableEquipment: [...STANDARD_EQUIPMENT],
          progression: {
            week,
            totalWeeks: WEEKS,
            seriesTitle: previousWeeks[0]?.title,
            previousWeeks,
          },
        });
      } catch (err) {
        console.error(
          `   ${sport} week ${week} attempt ${attempt} failed:`,
          err instanceof Error ? err.message : err
        );
        if (attempt === 2) throw err;
      }
    }
    if (!content) throw new Error(`${sport} week ${week}: no content`);

    content.title = weekTitle(content.title, week);

    const { error } = await supabase.from("programs").insert({
      sport,
      age_groups: AGE_GROUPS,
      age_group: AGE_GROUPS[0],
      duration_minutes: DURATION_MINUTES,
      skill_focus: content.title,
      content_json: content as unknown as Record<string, unknown>,
      equipment_used: content.equipmentNeeded ?? [...STANDARD_EQUIPMENT],
      created_by: CREATED_BY,
      version_number: 1,
      parent_version_id: null,
      series_id: seriesId,
      series_week: week,
      series_length: WEEKS,
      tags: ["seeded", "curriculum"],
    });
    if (error) throw new Error(`${sport} week ${week} insert: ${error.message}`);

    previousWeeks.push({
      week,
      title: content.title,
      objectives: content.objectives ?? [],
      skills: (content.skillDevelopment ?? []).map((d) => d.name),
    });
    console.log(`   ${sport}: week ${week}/${WEEKS} done`);
  }
  console.log(`✓  ${sport}: 8-week series complete`);
}

async function main() {
  console.log(`Seeding ${WEEKS}-week series for ${SPORTS.length} sports…`);
  const queue = [...SPORTS];
  const failures: string[] = [];

  async function worker() {
    while (queue.length > 0) {
      const sport = queue.shift()!;
      try {
        await seedSport(sport);
      } catch (err) {
        failures.push(sport);
        console.error(`✗  ${sport} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENT_SPORTS }, () => worker())
  );

  console.log(
    failures.length === 0
      ? "\nAll sports seeded."
      : `\nDone with failures (re-run to retry just these): ${failures.join(", ")}`
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

void main();
