import { PathwayEditor } from "@/components/training/pathway-editor";

export default function OpsNewPathwayPage() {
  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Operations
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          New Pathway
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a new training pathway for coaches.
        </p>
      </div>

      <PathwayEditor mode="create" />
    </div>
  );
}
