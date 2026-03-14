/**
 * Seed auth users in Supabase to match profile records from seed.sql.
 * Run with: npx tsx scripts/seed-auth-users.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEFAULT_PASSWORD = "BuildAlpha2026!";

const SEED_USERS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    email: "admin@buildalphakids.com.au",
    role: "admin",
    name: "Jordan Mitchell",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    email: "abdul@buildalphakids.com.au",
    role: "ops",
    name: "Abdul Rahman",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    email: "coach.liam@example.com",
    role: "coach",
    name: "Liam Thompson",
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    email: "coach.sarah@example.com",
    role: "coach",
    name: "Sarah Chen",
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    email: "coach.marcus@example.com",
    role: "coach",
    name: "Marcus Williams",
  },
];

async function seedAuthUsers() {
  console.log("Seeding auth users...\n");

  for (const user of SEED_USERS) {
    // Check if user already exists
    const { data: existing } = await supabase.auth.admin.getUserById(user.id);

    if (existing?.user) {
      console.log(`✓ ${user.email} (${user.role}) — already exists, skipping`);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password: DEFAULT_PASSWORD,
      email_confirm: true, // auto-confirm so they can log in immediately
      user_metadata: { name: user.name, role: user.role },
    });

    if (error) {
      console.error(`✗ ${user.email} — ${error.message}`);
    } else {
      console.log(`✓ ${user.email} (${user.role}) — created`);
    }
  }

  console.log(`\n--- Done ---`);
  console.log(`Default password for all users: ${DEFAULT_PASSWORD}`);
  console.log(`Change passwords after first login.`);
}

seedAuthUsers().catch(console.error);
