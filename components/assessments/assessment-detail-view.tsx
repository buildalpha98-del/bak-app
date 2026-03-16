"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
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
  "3-5": "3\u20135 years",
  "5-8": "5\u20138 years",
  "8-12": "8\u201312 years",
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            render={<Link href={basePath} />}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-heading text-foreground tracking-tight">
              {template.sport}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Assessment Template
            </p>
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
                This will permanently delete the &ldquo;{template.sport}&rdquo;
                assessment template for {AGE_GROUP_LABELS[template.age_group]}.
                This action cannot be undone.
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

      {/* Details Card */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
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
                {template.term_name ?? "\u2014"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Centre
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {template.centre_name ?? "\u2014"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Created by
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {template.creator_name ?? "\u2014"}
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
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Ratings
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {template.ratings_count} rating
                {template.ratings_count !== 1 ? "s" : ""} recorded
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Skills Card */}
      <Card>
        <CardHeader>
          <CardTitle>
            Skills ({template.skills_json.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {template.skills_json.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No skills defined for this template.
            </p>
          ) : (
            <div className="space-y-3">
              {template.skills_json.map((skill, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-border bg-muted/30 p-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {index + 1}. {skill.name}
                  </p>
                  {skill.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {skill.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
