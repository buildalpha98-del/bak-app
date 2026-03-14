import { getSequences } from "@/lib/crm/sequence-actions";
import { SequenceListView } from "@/components/crm/sequence-list-view";

export default async function AdminSequencesPage() {
  const { data, error } = await getSequences();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return <SequenceListView sequences={data ?? []} />;
}
