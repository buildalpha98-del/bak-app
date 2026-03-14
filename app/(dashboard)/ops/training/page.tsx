import { getTrainingModules } from "@/lib/training/actions";
import { getTrainingPathways } from "@/lib/training/actions";
import { ModuleListView } from "@/components/training/module-list-view";
import { PathwaysPlaceholder } from "@/components/training/pathways-placeholder";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function OpsTrainingPage() {
  const [modules, pathways] = await Promise.all([
    getTrainingModules(),
    getTrainingPathways(),
  ]);

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Operations
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Training
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage training modules and learning pathways for coaches.
        </p>
      </div>

      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="pathways">Pathways</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="mt-4">
          <ModuleListView initialModules={modules} />
        </TabsContent>

        <TabsContent value="pathways" className="mt-4">
          <PathwaysPlaceholder pathways={pathways} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
