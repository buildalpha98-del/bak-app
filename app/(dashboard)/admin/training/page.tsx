import { getTrainingModules, getTrainingPathways } from "@/lib/training/actions";
import { getTrainingStatusPulse } from "@/lib/training/status-pulse-actions";
import { ModuleListView } from "@/components/training/module-list-view";
import { PathwayListView } from "@/components/training/pathway-list-view";
import { TrainingStatusPulseStrip } from "@/components/training/training-status-pulse";
import { TrainingTabsShell } from "@/components/training/training-tabs-shell";

export default async function TrainingPage() {
  const [modules, pathways, pulse] = await Promise.all([
    getTrainingModules(),
    getTrainingPathways(),
    getTrainingStatusPulse(),
  ]);

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Admin
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Training
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage training modules and learning pathways for coaches.
        </p>
      </div>

      <TrainingStatusPulseStrip pulse={pulse} basePath="/admin/training" />

      <TrainingTabsShell
        modulesPanel={
          <ModuleListView
            initialModules={modules}
            basePath="/admin/training"
          />
        }
        pathwaysPanel={<PathwayListView pathways={pathways} />}
      />
    </div>
  );
}
