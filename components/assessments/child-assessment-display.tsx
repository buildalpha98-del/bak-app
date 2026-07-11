"use client";

import { useEffect, useState } from "react";
import { Star, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { getChildAssessments } from "@/lib/assessments/actions";
import type {
  ChildAssessmentHistory,
  SkillRatingEntry,
} from "@/lib/assessments/actions";

interface ChildAssessmentDisplayProps {
  childId: string;
}

interface SportGroup {
  sport: string;
  assessments: ChildAssessmentHistory[];
}

interface SkillProgression {
  skillName: string;
  ratings: { termName: string; rating: number }[];
  change: number | null; // null when only one term
}

function groupBySport(
  assessments: ChildAssessmentHistory[]
): SportGroup[] {
  const map = new Map<string, ChildAssessmentHistory[]>();

  for (const a of assessments) {
    const existing = map.get(a.sport) ?? [];
    existing.push(a);
    map.set(a.sport, existing);
  }

  return Array.from(map.entries()).map(([sport, items]) => ({
    sport,
    assessments: items.sort(
      (a, b) =>
        new Date(a.assessed_at).getTime() - new Date(b.assessed_at).getTime()
    ),
  }));
}

function buildProgressions(
  assessments: ChildAssessmentHistory[]
): SkillProgression[] {
  // Collect all unique skill names across all terms
  const skillNames = new Set<string>();
  for (const a of assessments) {
    for (const entry of a.ratings_json) {
      skillNames.add(entry.skill_name);
    }
  }

  return Array.from(skillNames).map((skillName) => {
    const ratings: { termName: string; rating: number }[] = [];

    for (const a of assessments) {
      const entry = a.ratings_json.find((r) => r.skill_name === skillName);
      if (entry) {
        ratings.push({ termName: a.term_name, rating: entry.rating });
      }
    }

    let change: number | null = null;
    if (ratings.length >= 2) {
      change = ratings[ratings.length - 1].rating - ratings[ratings.length - 2].rating;
    }

    return { skillName, ratings, change };
  });
}

function computeOverallChange(progressions: SkillProgression[]): number | null {
  const changes = progressions
    .map((p) => p.change)
    .filter((c): c is number => c !== null);

  if (changes.length === 0) return null;
  return changes.reduce((sum, c) => sum + c, 0) / changes.length;
}

function ChangeIndicator({ change }: { change: number | null }) {
  if (change === null) return null;

  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-medium text-green-600">
        <span aria-hidden="true">&uarr;</span>
        <span>+{change.toFixed(1)}</span>
      </span>
    );
  }

  if (change < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-medium text-red-600">
        <span aria-hidden="true">&darr;</span>
        <span>{change.toFixed(1)}</span>
      </span>
    );
  }

  return (
    <span className="text-muted-foreground inline-flex items-center gap-0.5 text-sm font-medium">
      <span aria-hidden="true">&rarr;</span>
      <span>0.0</span>
    </span>
  );
}

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < rating
              ? "fill-primary text-primary"
              : "fill-none text-muted-foreground/40"
          }`}
        />
      ))}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SingleTermView({ assessment }: { assessment: ChildAssessmentHistory }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{assessment.term_name}</Badge>
        <span className="text-muted-foreground text-xs">
          {new Date(assessment.assessed_at).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>
      <ul className="space-y-2">
        {assessment.ratings_json.map((entry) => {
          const skill = assessment.skills.find(
            (s) => s.name === entry.skill_name
          );
          return (
            <li
              key={entry.skill_name}
              className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium">{entry.skill_name}</p>
                {skill?.description && (
                  <p className="text-muted-foreground text-xs">
                    {skill.description}
                  </p>
                )}
              </div>
              <StarRating rating={entry.rating} />
            </li>
          );
        })}
      </ul>
      {assessment.notes && (
        <p className="text-muted-foreground mt-2 text-sm italic">
          {assessment.notes}
        </p>
      )}
    </div>
  );
}

function ProgressionView({
  assessments,
}: {
  assessments: ChildAssessmentHistory[];
}) {
  const progressions = buildProgressions(assessments);
  const overallChange = computeOverallChange(progressions);
  const termNames = assessments.map((a) => a.term_name);

  return (
    <div className="space-y-4">
      {/* Term badges */}
      <div className="flex flex-wrap items-center gap-2">
        {assessments.map((a) => (
          <Badge key={a.term_id} variant="secondary">
            {a.term_name}
          </Badge>
        ))}
        {overallChange !== null && (
          <div className="ml-auto flex items-center gap-1">
            <span className="text-muted-foreground text-xs">Overall:</span>
            <ChangeIndicator change={overallChange} />
          </div>
        )}
      </div>

      {/* Skill progression table */}
      <div className="space-y-3">
        {progressions.map((prog) => (
          <div
            key={prog.skillName}
            className="rounded-lg border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{prog.skillName}</p>
              <ChangeIndicator change={prog.change} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              {prog.ratings.map((r, idx) => (
                <div key={r.termName} className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {r.termName}:
                  </span>
                  <StarRating rating={r.rating} />
                  {idx < prog.ratings.length - 1 && (
                    <span className="text-muted-foreground mx-1" aria-hidden="true">
                      &rarr;
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Latest notes */}
      {assessments[assessments.length - 1].notes && (
        <p className="text-muted-foreground text-sm italic">
          Latest notes: {assessments[assessments.length - 1].notes}
        </p>
      )}
    </div>
  );
}

export function ChildAssessmentDisplay({
  childId,
}: ChildAssessmentDisplayProps) {
  const [assessments, setAssessments] = useState<ChildAssessmentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const result = await getChildAssessments(childId);

      if (cancelled) return;

      if (result.error) {
        setError(result.error);
      } else {
        setAssessments(result.data);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <TrendingUp className="h-5 w-5" />
          Skill Assessments
        </h2>
        <LoadingSkeleton />
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Skill Assessments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">
            Failed to load assessments: {error}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (assessments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Skill Assessments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No skill assessments recorded yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sportGroups = groupBySport(assessments);

  return (
    <div className="space-y-4">
      {sportGroups.map((group) => (
        <Card key={group.sport}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {group.sport}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {group.assessments.length === 1 ? (
              <SingleTermView assessment={group.assessments[0]} />
            ) : (
              <ProgressionView assessments={group.assessments} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
