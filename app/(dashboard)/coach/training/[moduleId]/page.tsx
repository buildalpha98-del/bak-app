import { notFound } from "next/navigation";
import { getModuleForCompletion } from "@/lib/training/completion-actions";
import { ModuleCompletionView } from "@/components/training/completion/module-completion-view";

export default async function ModuleCompletionPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  const data = await getModuleForCompletion(moduleId);
  if (!data) notFound();

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Training
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          {data.module.title}
        </h1>
        {data.module.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {data.module.description}
          </p>
        )}
      </div>
      <ModuleCompletionView
        module={data.module}
        assignment={data.assignment}
        attempts={data.attempts}
      />
    </div>
  );
}
