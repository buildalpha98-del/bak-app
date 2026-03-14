import { notFound } from "next/navigation";
import { getSequenceDetail } from "@/lib/crm/sequence-actions";
import { SequenceEditor } from "@/components/crm/sequence-editor";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminSequenceDetailPage({ params }: Props) {
  const { id } = await params;
  const { data, error } = await getSequenceDetail(id);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) notFound();

  return <SequenceEditor sequence={data} />;
}
