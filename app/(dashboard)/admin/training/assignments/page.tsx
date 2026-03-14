import {
  getActiveCoaches,
  getPublishedModulesForAssignment,
  getPublishedPathwaysForAssignment,
} from "@/lib/training/assignment-actions";
import { AssignmentManager } from "@/components/training/assignment-manager";

export default async function TrainingAssignmentsPage() {
  const [coaches, modules, pathways] = await Promise.all([
    getActiveCoaches(),
    getPublishedModulesForAssignment(),
    getPublishedPathwaysForAssignment(),
  ]);

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Admin
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Training Assignments
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign training modules and pathways to coaches.
        </p>
      </div>

      <AssignmentManager
        coaches={coaches}
        modules={modules}
        pathways={pathways}
      />
    </div>
  );
}
