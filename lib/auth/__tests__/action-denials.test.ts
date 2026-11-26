/// <reference types="vite/client" />
import { it, expect, vi, beforeEach } from "vitest";
import gates from "../../../docs/audits/phase1-action-gates.json";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: "parent", status: "active" }, error: null }) }) }) }) }) }));
import { createSupabaseAdmin } from "@/lib/supabase/admin";
const modules = import.meta.glob("../../**/*actions.ts");
beforeEach(() => { vi.clearAllMocks(); auth.getUser.mockResolvedValue({ data: { user: { id: "parent", email: "parent@example.com" } }, error: null }); });
for (const [path, [, ...names]] of Object.entries(gates)) {
  // Storage setup is not an *actions.ts module, and has its own source boundary check.
  const loader = modules["../../" + path.replace(/^lib\//, "")];
  if (!loader) continue;
  it(`${path}: every audited action rejects a portal principal before privileged access`, async () => {
    const exports = await loader() as Record<string, (...args: unknown[]) => Promise<unknown>>;
    for (const name of names) {
      await expect(exports[name]({}, {}, {}), name).rejects.toThrow("Not authorised.");
    }
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
}
