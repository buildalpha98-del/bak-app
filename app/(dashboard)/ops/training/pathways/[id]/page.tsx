import { notFound } from "next/navigation";
import { getTrainingPathway } from "@/lib/training/actions";
import { PathwayEditor } from "@/components/training/pathway-editor";

export default async function OpsEditPathwayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pathway = await getTrainingPathway(id);

  if (!pathway) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Operations
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Edit Pathway
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update pathway details and manage modules.
        </p>
      </div>

      <PathwayEditor mode="edit" pathway={pathway} />
    </div>
  );
}
