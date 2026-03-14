import { getCentreList } from "@/lib/centres/actions";
import { CentreListView } from "@/components/centres/centre-list-view";

export default async function AdminCentresPage() {
  const { data, error } = await getCentreList();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return <CentreListView initialData={data ?? []} basePath="/admin/centres" />;
}
