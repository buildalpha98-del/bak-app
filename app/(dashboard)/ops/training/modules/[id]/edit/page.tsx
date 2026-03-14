import { notFound } from "next/navigation";
import { getTrainingModule } from "@/lib/training/actions";
import { ModuleEditor } from "@/components/training/module-editor";

export default async function OpsEditTrainingModulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const module = await getTrainingModule(id);

  if (!module) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Training
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Edit Module
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update training module details and content.
        </p>
      </div>

      <ModuleEditor mode="edit" module={module} />
    </div>
  );
}
