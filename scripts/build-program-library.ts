/**
 * Library builder — batch AI generation to fill sport × age-band gaps
 * with term-length series (curriculum build, Sep 2026).
 *
 * The original seed (seed-program-series.ts) generated ONE series per
 * sport across ALL THREE bands at once — great childcare coverage, but
 * the titles came out toddler-toned ("Ball Buddies & Balanced
 * Landings") and the outcomes mixed EYLF with PDHPE, which is exactly
 * what a school principal sees on Scope & Sequence. This script fills
 * PER-BAND series: single-band pitch, so the 5-8 and 8-12 blocks read
 * like school programmes with clean PDHPE outcomes.
 *
 * - Default: every sport × the SCHOOL bands (5-8, 8-12), 8 weeks each.
 * - Weeks generate sequentially per cell with progression context;
 *   cells run through a 3-way worker pool.
 * - Idempotent per (sport, band, length): safe to re-run after partial
 *   failure — only missing cells generate.
 *
 * Usage:
 *   npx tsx scripts/build-program-library.ts
 *   npx tsx scripts/build-program-library.ts --bands 5-8 --sports "Netball,Soccer" --weeks 8
 *
 * Requires ANTHROPIC_API_KEY + SUPABASE_SERVICE_ROLE_KEY in .env.local /
 * .env.production.local (refresh via vercel env pull; trim newlines).
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";
import { randomUUID } from "crypto";

dotenv.config({ path: resolve(__dirname, "../.env.local") });
dotenv.config({ path: resolve(__dirname, "../.env.production.local") });

import { generateProgram } from "../lib/ai/generate-program";
import { STANDARD_EQUIPMENT } from "../lib/ai/types";
import { SPORTS } from "../lib/types/enums";
import type { ProgramContentJson } from "../lib/ai/types";

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!supabaseUrl || !serviceRoleKey || !process.env.ANTHROPIC_API_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or ANTHROPIC_API_KEY"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? (process.argv[idx + 1] ?? null) : null;
}

const WEEKS = Number(argValue("--weeks") ?? 8);
const DURATION_MINUTES = Number(argValue("--duration") ?? 45);
const BANDS = (argValue("--bands") ?? "5-8,8-12")
  .split(",")
  .map((b) => b.trim())
  .filter(Boolean);
const SPORT_LIST = (argValue("--sports")?.split(",").map((s) => s.trim()) ?? [
  ...SPORTS,
]).filter(Boolean);
const CONCURRENT = Number(argValue("--concurrency") ?? 3);

let CREATED_BY = "";

async function resolveCreatedBy(): Promise<string> {
  if (process.env.SEED_CREATED_BY) return process.env.SEED_CREATED_BY;
  const { data } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("role", "admin")
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!data) {
    throw new Error(
      "No active admin profile found. Set SEED_CREATED_BY to a profiles.id."
    );
  }
  console.log(`Generated programmes will be owned by: ${data.name}`);
  return data.id as string;
}

function weekTitle(raw: string, week: number): string {
  return /week\s*\d/i.test(raw) ? raw : `${raw} — Week ${week} of ${WEEKS}`;
}

/** A cell is done when a same-length series pitched at exactly this band exists. */
async function cellAlreadyBuilt(sport: string, band: string): Promise<boolean> {
  const { data } = await supabase
    .from("programs")
    .select("id")
    .eq("sport", sport)
    .eq("age_group", band)
    .contains("age_groups", JSON.stringify([band]))
    .eq("series_week", 1)
    .eq("series_length", WEEKS)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function buildCell(sport: string, band: string): Promise<void> {
  if (await cellAlreadyBuilt(sport, band)) {
    console.log(`↷  ${sport} ${band}: already built, skipping`);
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
    for (let attempt = 1; attempt <= 2 && !content; attempt++) {
      try {
        content = await generateProgram({
          sport,
          ageGroups: [band],
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
          `   ${sport} ${band} week ${week} attempt ${attempt} failed:`,
          err instanceof Error ? err.message : err
        );
        if (attempt === 2) throw err;
      }
    }
    if (!content) throw new Error(`${sport} ${band} week ${week}: no content`);

    content.title = weekTitle(content.title, week);

    const { error } = await supabase.from("programs").insert({
      sport,
      age_groups: [band],
      age_group: band,
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
      tags: ["seeded", "curriculum", `band:${band}`],
    });
    if (error)
      throw new Error(`${sport} ${band} week ${week} insert: ${error.message}`);

    previousWeeks.push({
      week,
      title: content.title,
      objectives: content.objectives ?? [],
      skills: (content.skillDevelopment ?? []).map((d) => d.name),
    });
    console.log(`   ${sport} ${band}: week ${week}/${WEEKS} done`);
  }
  console.log(`✓  ${sport} ${band}: ${WEEKS}-week series complete`);
}

async function main() {
  CREATED_BY = await resolveCreatedBy();
  const cells = SPORT_LIST.flatMap((sport) =>
    BANDS.map((band) => ({ sport, band }))
  );
  console.log(
    `Building ${WEEKS}-week series for ${cells.length} sport×band cells (${SPORT_LIST.length} sports × ${BANDS.join("/")}), ${CONCURRENT} at a time…`
  );
  const queue = [...cells];
  const failures: string[] = [];

  async function worker() {
    while (queue.length > 0) {
      const cell = queue.shift()!;
      try {
        await buildCell(cell.sport, cell.band);
      } catch (err) {
        failures.push(`${cell.sport} ${cell.band}`);
        console.error(
          `✗  ${cell.sport} ${cell.band} failed:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENT }, () => worker()));

  console.log(
    failures.length === 0
      ? "\nAll cells built."
      : `\nDone with failures (re-run to retry just these): ${failures.join(", ")}`
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

void main();
