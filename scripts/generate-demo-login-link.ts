/**
 * Mint a one-time magic-link login URL for the demo school tester
 * account — handy right before a school demo, no inbox round-trip.
 *
 * Run with: npx tsx scripts/generate-demo-login-link.ts [email]
 * Default email: jayden+schooldemo@amanaoshc.com.au
 *
 * The link is single-use and expires quickly; generate a fresh one per
 * demo. It signs the browser in as that portal user on production.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const EMAIL = (process.argv[2] ?? "jayden+schooldemo@amanaoshc.com.au")
  .trim()
  .toLowerCase();

async function main() {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
    options: {
      redirectTo: "https://buildalphakids.app/auth/callback?next=/client-login",
    },
  });
  if (error) throw error;
  console.log(data.properties?.action_link);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
