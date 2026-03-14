import { notFound } from "next/navigation";
import { getChildDetail } from "@/lib/children/actions";
import ChildDetailView from "@/components/children/child-detail-view";

export const metadata = {
  title: "Child Details | Build Alpha Kids",
};

export default async function AdminChildDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data, error } = await getChildDetail(id);

  if (error || !data) {
    notFound();
  }

  return (
    <div className="container max-w-4xl py-6">
      <ChildDetailView data={data} basePath="/admin/children" />
    </div>
  );
}
