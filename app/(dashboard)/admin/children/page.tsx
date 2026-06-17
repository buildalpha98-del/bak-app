import { getChildrenList } from "@/lib/children/actions";
import { getCentreList } from "@/lib/centres/actions";
import { getRegions } from "@/lib/regions/actions";
import { getChildrenStatusPulse } from "@/lib/children/status-pulse-actions";
import ChildrenListView from "@/components/children/children-list-view";
import { ChildrenStatusPulseStrip } from "@/components/children/children-status-pulse";

export const metadata = {
  title: "Children | Build Alpha Kids",
};

export default async function AdminChildrenPage() {
  const [childrenResult, centresResult, regionsResult, pulse] =
    await Promise.all([
      getChildrenList(),
      getCentreList(),
      getRegions(),
      getChildrenStatusPulse(),
    ]);

  const children = childrenResult.data ?? [];
  const centres = (centresResult.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));
  const regions = (regionsResult.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
  }));

  return (
    <div className="container max-w-6xl space-y-6 py-6">
      <ChildrenStatusPulseStrip
        pulse={pulse}
        basePath="/admin/children"
      />
      <ChildrenListView
        children={children}
        centres={centres}
        regions={regions}
        basePath="/admin/children"
      />
    </div>
  );
}
