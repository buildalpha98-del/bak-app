import {
  getCentreList,
  getCentresStatusPulseWithCompare,
} from "@/lib/centres/actions";
import { getRegions } from "@/lib/regions/actions";
import { getFinancialAccess } from "@/lib/auth/financial-access";
import { CentreListView } from "@/components/centres/centre-list-view";
import { CentresStatusPulseStrip } from "@/components/admin/centres-status-pulse";
import {
  CompareSelect,
  compareParamToPeriodKey,
} from "@/components/shared/compare-select";

export const dynamic = "force-dynamic";

export default async function AdminCentresPage({
  searchParams,
}: {
  searchParams?: Promise<{ compare?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const compareTo = compareParamToPeriodKey(params.compare);

  // Fan out — pulse (with optional compare half), list, regions,
  // financial gate all in parallel so the LCP is bottlenecked by the
  // slowest one, not the sum.
  const [pulseRes, { data, error }, regionsRes, hasFinancial] =
    await Promise.all([
      getCentresStatusPulseWithCompare({ compareTo }),
      getCentreList(),
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
      <div className="flex items-center justify-end">
        <CompareSelect />
      </div>
      <CentresStatusPulseStrip
        pulse={pulseRes.current}
        previous={pulseRes.previous}
        compareLabel={pulseRes.compareLabel}
        basePath="/admin/centres"
      />
      <CentreListView
        initialData={data ?? []}
        basePath="/admin/centres"
        regions={regions}
        hasFinancialAccess={hasFinancial}
      />
    </div>
  );
}
