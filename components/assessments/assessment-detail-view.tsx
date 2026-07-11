"use client";

// ============================================================
// AssessmentDetailView
// ============================================================
//
// Tabbed detail page for an assessment template. Mirrors the centres /
// children detail-view pattern: a single TabsList with count badges,
// rounded-2xl card containers, restrained brand orange reserved for
// destructive confirmations and the "Save"-shaped CTAs.
//
// Three tabs:
//   - Skills    — the rubric. Inline-editable in a follow-up; today
//                 read-only display matching the create flow.
//   - Settings  — sport / age / term / centre / creator / created
//   - Ratings   — link out to view-by-child surface, and a count chip.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  Loader2,
  ClipboardList,
  Cog,
  Star,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { AssessmentTemplateDetail } from "@/lib/assessments/actions";
import { deleteAssessmentTemplate } from "@/lib/assessments/actions";
import type { AgeGroup } from "@/lib/types/enums";

const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  "3-5": "3–5 years",
  "5-8": "5–8 years",
  "8-12": "8–12 years",
};

interface AssessmentDetailViewProps {
  template: AssessmentTemplateDetail;
  basePath: string;
}

export function AssessmentDetailView({
  template,
  basePath,
}: AssessmentDetailViewProps) {
  const router = useRouter();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<string>("skills");

  function handleDelete() {
    startDeleteTransition(async () => {
      const { error } = await deleteAssessmentTemplate(template.id);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Assessment template deleted.");
      router.push(basePath);
    });
  }

  const skillCount = template.skills_json.length;
  const noSkills = skillCount === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            render={<Link href={basePath} />}
            aria-label="Back to assessments"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-heading text-foreground tracking-tight">
              {template.sport}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <Badge variant="secondary">
                {AGE_GROUP_LABELS[template.age_group]}
              </Badge>
              <span>·</span>
              <span>
                {skillCount} skill{skillCount === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span>
                {template.ratings_count} rating
                {template.ratings_count !== 1 ? "s" : ""}
              </span>
              {noSkills && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  <AlertTriangle className="size-3" />
                  No skills yet
                </span>
              )}
            </div>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="destructive"
                size="sm"
                className="min-h-[44px] sm:min-h-0"
                disabled={isDeleting}
              />
            }
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete assessment template?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the &ldquo;{template.sport}&rdquo;{" "}
                {AGE_GROUP_LABELS[template.age_group]} template. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line" className="flex-wrap gap-x-1 gap-y-2">
          <TabsTrigger value="skills">
            <ClipboardList className="size-4" />
            Skills ({skillCount})
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Cog className="size-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="ratings">
            <Star className="size-4" />
            Ratings ({template.ratings_count})
          </TabsTrigger>
        </TabsList>

        {/* Skills tab */}
        <TabsContent value="skills">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Skill rubric</CardTitle>
              <CardDescription>
                The list of skills coaches will rate from 1–5 for each child.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {noSkills ? (
                <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center text-sm">
                  <AlertTriangle className="mx-auto mb-2 size-6 text-primary" />
                  <p className="font-medium text-foreground">
                    No skills defined yet
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Open the create flow with this sport + age preset to add
                    skills, or generate them with AI.
                  </p>
                </div>
              ) : (
                <ol className="space-y-3">
                  {template.skills_json.map((skill, index) => (
                    <li
                      key={index}
                      className="rounded-2xl border border-border bg-muted/30 p-3 transition hover:bg-muted/40"
                    >
                      <p className="text-sm font-medium text-foreground">
                        <span className="text-muted-foreground">
                          {index + 1}.
                        </span>{" "}
                        {skill.name}
                      </p>
                      {skill.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {skill.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings tab */}
        <TabsContent value="settings">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Settings</CardTitle>
              <CardDescription>
                Scope of this template — which term, sport, age group, and
                centre it applies to.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Sport
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-foreground">
                    {template.sport}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Age Group
                  </dt>
                  <dd className="mt-0.5">
                    <Badge variant="outline" className="text-xs">
                      {AGE_GROUP_LABELS[template.age_group]}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Term
                  </dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {template.term_name ?? (
                      <span className="text-muted-foreground">All terms</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Centre
                  </dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {template.centre_name ?? (
                      <span className="text-muted-foreground">Org-wide</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Created by
                  </dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {template.creator_name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Created
                  </dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {new Date(template.created_at).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ratings tab */}
        <TabsContent value="ratings">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Skill ratings</CardTitle>
              <CardDescription>
                {template.ratings_count > 0
                  ? `${template.ratings_count} rating${template.ratings_count === 1 ? "" : "s"} recorded against this template.`
                  : "No ratings have been recorded against this template yet."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {template.ratings_count === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center text-sm">
                  <Star className="mx-auto mb-2 size-6 text-muted-foreground/50" />
                  <p className="font-medium text-foreground">
                    No ratings yet
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Once coaches submit ratings against this template, they
                    appear in the child detail page under the Assessments tab.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-muted/20 p-4 text-sm">
                  <p className="text-foreground">
                    Individual child ratings are visible on each child's
                    profile under the Assessments tab. Use the children list
                    to drill into a specific child.
                  </p>
                  <Link
                    href={`${basePath.replace("/assessments", "/children")}?assessment=overdue`}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    View children pending this term
                    <ArrowLeft className="size-3 rotate-180" />
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
