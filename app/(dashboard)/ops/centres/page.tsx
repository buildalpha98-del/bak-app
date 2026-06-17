import {
  getCentreList,
  getCentresStatusPulse,
} from "@/lib/centres/actions";
import { getRegions } from "@/lib/regions/actions";
import { getFinancialAccess } from "@/lib/auth/financial-access";
import { CentreListView } from "@/components/centres/centre-list-view";
import { CentresStatusPulseStrip } from "@/components/admin/centres-status-pulse";

export const dynamic = "force-dynamic";

export default async function OpsCentresPage() {
  const [{ data, error }, pulse, regionsRes, hasFinancial] = await Promise.all([
    getCentreList(),
    getCentresStatusPulse(),
    getRegions(),
    getFinancialAccess(),
  ]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const regions =
    (regionsRes.data ?? []).map((r) => ({ id: r.id, name: r.name })) ?? [];

  return (
    <div className="space-y-6">
      <CentresStatusPulseStrip pulse={pulse} basePath="/ops/centres" />
      <CentreListView
        initialData={data ?? []}
        basePath="/ops/centres"
        regions={regions}
        hasFinancialAccess={hasFinancial}
      />
    </div>
  );
}
