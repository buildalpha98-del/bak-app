import { getStaffList } from "@/lib/staff/actions";
import { getStaffStatusPulse } from "@/lib/staff/status-pulse-actions";
import { getRegions } from "@/lib/regions/actions";
import { getFinancialAccess } from "@/lib/auth/financial-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StaffListView } from "@/components/staff/staff-list-view";
import { StaffStatusPulseStrip } from "@/components/staff/staff-status-pulse";
import type { UserRole } from "@/lib/types/enums";

export default async function StaffPage() {
  // Fan out the four lookups in parallel — they're independent and the
  // page can't render until all four resolve.
  const supabase = await createSupabaseServerClient();
  const userRes = await supabase.auth.getUser();
  const viewerId = userRes.data.user?.id ?? null;

  const [{ data, error }, pulse, regionsRes, hasFinancialAccess, viewerProfileRes] =
    await Promise.all([
      getStaffList(),
      getStaffStatusPulse(),
      getRegions(),
      getFinancialAccess(),
      viewerId
        ? supabase
            .from("profiles")
            .select("role")
            .eq("id", viewerId)
            .single()
        : Promise.resolve({ data: null }),
    ]);

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Staff</h1>
        <p className="mt-2 text-red-600">Failed to load staff: {error}</p>
      </div>
    );
  }

  const regions = (regionsRes.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
  }));
  const viewerRole = (viewerProfileRes.data?.role as UserRole) ?? "admin";

  return (
    <div className="space-y-6">
      <StaffStatusPulseStrip pulse={pulse} basePath="/admin/staff" />
      <StaffListView
        initialData={data ?? []}
        basePath="/admin/staff"
        regions={regions}
        hasFinancialAccess={hasFinancialAccess}
        viewerRole={viewerRole}
      />
    </div>
  );
}
