import { getTrainingPathways } from "@/lib/training/actions";
import { PathwayListView } from "@/components/training/pathway-list-view";

export default async function AdminPathwaysPage() {
  const pathways = await getTrainingPathways();

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Training
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Pathways
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage structured learning pathways for coaches.
        </p>
      </div>

      <PathwayListView pathways={pathways} />
    </div>
  );
}
