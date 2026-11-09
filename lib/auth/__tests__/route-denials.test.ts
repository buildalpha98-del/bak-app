/// <reference types="vite/client" />
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { createSupabaseAdmin } from "@/lib/supabase/admin";
const cronRoutes = import.meta.glob("../../../app/api/cron/*/route.ts");
const otherRoutes = import.meta.glob("../../../app/api/{crm/sequences/process,forecasts/generate,health-scores/calculate,public/refresh-stats}/route.ts");
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", ""); });
afterEach(() => vi.unstubAllEnvs());
for (const [path, load] of Object.entries({ ...cronRoutes, ...otherRoutes })) {
  it(`${path}: Bearer undefined cannot run a job when CRON_SECRET is unset`, async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    const route = await load() as { GET?: (r: NextRequest) => Promise<Response>; POST?: (r: NextRequest) => Promise<Response> };
    const response = await (route.GET ?? route.POST)!(new NextRequest("https://example.com/api/job", { headers: { authorization: "Bearer undefined" } }));
    expect(response.status).toBe(401);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
}
