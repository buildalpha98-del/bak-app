import { getTrainingModules } from "@/lib/training/actions";
import { ModuleListView } from "@/components/training/module-list-view";

export default async function OpsTrainingModulesPage() {
  const modules = await getTrainingModules();

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Training
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Modules
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All training modules available to coaches.
        </p>
      </div>

      <ModuleListView initialModules={modules} basePath="/ops/training" />
    </div>
  );
}
