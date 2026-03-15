/**
 * Create test client (centre/school) and parent accounts for review.
 * Run with: npx tsx scripts/seed-test-accounts.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEFAULT_PASSWORD = "BuildAlpha2026!";

// Seed centre IDs from seed.sql
const CENTRES = {
  littleStars: "aaaa1111-0000-0000-0000-000000000001", // childcare
  bankstownSchool: "aaaa1111-0000-0000-0000-000000000004", // school
};

const TEST_ACCOUNTS = [
  // Client portal - school contact
  {
    id: "66666666-6666-6666-6666-666666666666",
    email: "school@test.buildalphakids.com.au",
    name: "Test School Contact",
    type: "client" as const,
    centreId: CENTRES.bankstownSchool,
  },
  // Client portal - childcare contact
  {
    id: "77777777-7777-7777-7777-777777777777",
    email: "centre@test.buildalphakids.com.au",
    name: "Test Centre Contact",
    type: "client" as const,
    centreId: CENTRES.littleStars,
  },
  // Parent portal
  {
    id: "88888888-8888-8888-8888-888888888888",
    email: "parent@test.buildalphakids.com.au",
    name: "Test Parent",
    type: "parent" as const,
  },
];

async function seedTestAccounts() {
  console.log("Creating test accounts...\n");

  for (const account of TEST_ACCOUNTS) {
    // Check if auth user already exists
    const { data: existing } = await supabase.auth.admin.getUserById(account.id);

    if (existing?.user) {
      console.log(`✓ ${account.email} (${account.type}) — already exists, skipping auth`);
    } else {
      const { error } = await supabase.auth.admin.createUser({
        id: account.id,
        email: account.email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { name: account.name, role: account.type === "client" ? "client" : "parent" },
      });

      if (error) {
        console.error(`✗ ${account.email} — auth error: ${error.message}`);
        continue;
      }
      console.log(`✓ ${account.email} — auth user created`);
    }

    // Create role-specific records
    if (account.type === "client" && account.centreId) {
      // Check if centre exists
      const { data: centre } = await supabase
        .from("centres")
        .select("id, name")
        .eq("id", account.centreId)
        .single();

      if (!centre) {
        console.log(`  ⚠ Centre ${account.centreId} not found — skipping client_users insert`);
        continue;
      }

      // Upsert client_users
      const { error: clientError } = await supabase
        .from("client_users")
        .upsert(
          {
            user_id: account.id,
            centre_id: account.centreId,
            name: account.name,
            email: account.email,
            role: "director",
            is_primary: true,
          },
          { onConflict: "user_id,centre_id" }
        );

      if (clientError) {
        console.error(`  ✗ client_users insert error: ${clientError.message}`);
      } else {
        console.log(`  ✓ Linked to centre: ${centre.name}`);
      }
    }

    if (account.type === "parent") {
      // Create profiles row
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: account.id,
            email: account.email,
            name: account.name,
            role: "parent",
            status: "active",
          },
          { onConflict: "id" }
        );

      if (profileError) {
        console.error(`  ✗ profiles insert error: ${profileError.message}`);
      } else {
        console.log(`  ✓ Profile created (role: parent)`);
      }

      // Create parent_profiles row
      const { error: parentError } = await supabase
        .from("parent_profiles")
        .upsert(
          {
            user_id: account.id,
            first_name: "Test",
            last_name: "Parent",
            email: account.email,
            phone: "0400000000",
            suburb: "Bankstown",
            marketing_opt_in: false,
          },
          { onConflict: "user_id" }
        );

      if (parentError) {
        console.error(`  ✗ parent_profiles insert error: ${parentError.message}`);
      } else {
        console.log(`  ✓ Parent profile created`);
      }
    }
  }

  console.log(`\n--- Done ---`);
  console.log(`\nTest accounts:`);
  console.log(`  Admin:   admin@buildalphakids.com.au / ${DEFAULT_PASSWORD}`);
  console.log(`  Ops:     abdul@buildalphakids.com.au / ${DEFAULT_PASSWORD}`);
  console.log(`  Coach:   coach.liam@example.com / ${DEFAULT_PASSWORD}`);
  console.log(`  School:  school@test.buildalphakids.com.au / ${DEFAULT_PASSWORD}`);
  console.log(`  Centre:  centre@test.buildalphakids.com.au / ${DEFAULT_PASSWORD}`);
  console.log(`  Parent:  parent@test.buildalphakids.com.au / ${DEFAULT_PASSWORD}`);
  console.log(`\nNote: Client/Parent portals normally use magic links.`);
  console.log(`These test accounts have passwords set for convenience.`);
}

seedTestAccounts().catch(console.error);
