import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Public shared-link route — /client/shared/[token]
// ============================================================
//
// Regression: shared_links has RLS with no anon policy, and
// validateSharedLink read it through the cookie/anon client — so every
// link a director shared showed "Link Unavailable" to the person it was
// shared with. Only reproducible signed OUT, which is exactly the state
// the rest of the suite never visits.
//
// Unlike smoke.spec.ts this file is not read-only: the table starts
// empty in production, so the test creates one link for a real centre
// and deletes it afterwards. It writes nothing else.

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `E2E needs ${name}. Run: vercel env pull .env.production.local --environment=production`
    );
  }
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

test.describe("shared portal link", () => {
  let linkId: string | null = null;
  let token: string | null = null;
  let centreName: string | null = null;

  test.beforeAll(async () => {
    const admin = adminClient();
    const { data: creator, error: creatorError } = await admin
      .from("client_users")
      .select("id, centre_id, centres!client_users_centre_id_fkey(name)")
      .limit(1)
      .maybeSingle();
    if (creatorError) throw new Error(`client_users lookup failed: ${creatorError.message}`);
    if (!creator) return; // empty table — tests below skip

    const { data: link, error } = await admin
      .from("shared_links")
      .insert({ centre_id: creator.centre_id, created_by: creator.id })
      .select("id, token")
      .single();
    if (error || !link) throw new Error(`Could not create test link: ${error?.message}`);

    linkId = link.id;
    token = link.token;
    centreName = (creator.centres as unknown as { name: string }).name;
  });

  test.afterAll(async () => {
    if (linkId) {
      await adminClient().from("shared_links").delete().eq("id", linkId);
    }
  });

  test("an anonymous visitor can open a valid shared link", async ({ page }) => {
    test.skip(!token, "No client_users row to attach a shared link to.");

    await page.goto(`/client/shared/${token}`);
    const body = await page.locator("body").innerText();
    expect(body, "valid link rejected for a signed-out visitor").not.toContain(
      "Link Unavailable"
    );
    await expect(page.getByText("viewing a shared link")).toBeVisible();
    await expect(page.getByRole("heading", { name: centreName! })).toBeVisible();
  });

  test("a garbage token is still rejected", async ({ page }) => {
    await page.goto(`/client/shared/00000000-0000-0000-0000-000000000000`);
    await expect(page.getByText("Link Unavailable")).toBeVisible();
  });
});
