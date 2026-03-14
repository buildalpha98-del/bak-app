import { ModuleEditor } from "@/components/training/module-editor";

export default function NewTrainingModulePage() {
  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Training
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          New Module
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a new training module for coaches.
        </p>
      </div>

      <ModuleEditor mode="create" />
    </div>
  );
}
