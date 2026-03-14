import { getChildrenList } from "@/lib/children/actions";
import { getCentreList } from "@/lib/centres/actions";
import ChildrenListView from "@/components/children/children-list-view";

export const metadata = {
  title: "Children | Build Alpha Kids",
};

export default async function OpsChildrenPage() {
  const [childrenResult, centresResult] = await Promise.all([
    getChildrenList(),
    getCentreList(),
  ]);

  const children = childrenResult.data ?? [];
  const centres = (centresResult.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <div className="container max-w-6xl py-6">
      <ChildrenListView
        children={children}
        centres={centres}
        basePath="/ops/children"
      />
    </div>
  );
}
