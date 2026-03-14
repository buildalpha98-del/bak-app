"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CalendarCheck,
  ClipboardCheck,
  TrendingUp,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChildDetail } from "@/lib/client/portal-actions";

interface ChildDetailViewProps {
  child: ChildDetail;
  centreId: string;
}

type TabKey = "attendance" | "assessments" | "progression";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "attendance", label: "Attendance", icon: CalendarCheck },
  { key: "assessments", label: "Assessments", icon: ClipboardCheck },
  { key: "progression", label: "Progression", icon: TrendingUp },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < rating
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

export function ChildDetailView({ child, centreId }: ChildDetailViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("attendance");

  // Group assessments by term
  const assessmentsByTerm = useMemo(() => {
    const grouped = new Map<
      string,
      {
        term_name: string;
        term_id: string;
        entries: { sport: string; skills: { skill_name: string; rating: number }[]; assessed_at: string }[];
      }
    >();

    for (const assessment of child.assessments) {
      const existing = grouped.get(assessment.term_id);
      if (existing) {
        existing.entries.push({
          sport: assessment.sport,
          skills: assessment.skills,
          assessed_at: assessment.assessed_at,
        });
      } else {
        grouped.set(assessment.term_id, {
          term_name: assessment.term_name,
          term_id: assessment.term_id,
          entries: [
            {
              sport: assessment.sport,
              skills: assessment.skills,
              assessed_at: assessment.assessed_at,
            },
          ],
        });
      }
    }

    return Array.from(grouped.values());
  }, [child.assessments]);

  // Compute progression data (compare latest term to previous term)
  const progressionData = useMemo(() => {
    if (assessmentsByTerm.length < 2) return null;

    const latest = assessmentsByTerm[0];
    const previous = assessmentsByTerm[1];

    // Build skill maps for each term
    const latestSkills = new Map<string, number>();
    for (const entry of latest.entries) {
      for (const skill of entry.skills) {
        // Use highest rating if skill appears in multiple sports
        const current = latestSkills.get(skill.skill_name) ?? 0;
        if (skill.rating > current) {
          latestSkills.set(skill.skill_name, skill.rating);
        }
      }
    }

    const previousSkills = new Map<string, number>();
    for (const entry of previous.entries) {
      for (const skill of entry.skills) {
        const current = previousSkills.get(skill.skill_name) ?? 0;
        if (skill.rating > current) {
          previousSkills.set(skill.skill_name, skill.rating);
        }
      }
    }

    // Compare skills that exist in both terms
    const comparisons: {
      skill_name: string;
      previous_rating: number;
      current_rating: number;
      change: "improved" | "declined" | "same";
    }[] = [];

    for (const [skillName, currentRating] of latestSkills) {
      const prevRating = previousSkills.get(skillName);
      if (prevRating !== undefined) {
        comparisons.push({
          skill_name: skillName,
          previous_rating: prevRating,
          current_rating: currentRating,
          change:
            currentRating > prevRating
              ? "improved"
              : currentRating < prevRating
                ? "declined"
                : "same",
        });
      }
    }

    return {
      latestTerm: latest.term_name,
      previousTerm: previous.term_name,
      comparisons,
    };
  }, [assessmentsByTerm]);

  return (
    <div className="animate-fade-up space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
        render={(props) => (
          <Link {...props} href={`/client/${centreId}/children`} />
        )}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Children
      </Button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-100 text-lg font-semibold text-cyan-700">
          {child.first_name.charAt(0)}
        </div>
        <div>
          <h1 className="text-xl font-bold font-heading text-foreground sm:text-2xl">
            {child.first_name} {child.last_name}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge
              variant="secondary"
              className="bg-cyan-50 text-cyan-700 hover:bg-cyan-50"
            >
              {child.age_group} yrs
            </Badge>
            {child.date_of_birth && (
              <span className="text-xs text-muted-foreground">
                DOB: {formatDate(child.date_of_birth)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white text-cyan-700 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "attendance" && (
        <AttendanceTab records={child.attendanceHistory} />
      )}
      {activeTab === "assessments" && (
        <AssessmentsTab terms={assessmentsByTerm} />
      )}
      {activeTab === "progression" && (
        <ProgressionTab data={progressionData} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Attendance Tab                                                      */
/* ------------------------------------------------------------------ */

function AttendanceTab({
  records,
}: {
  records: ChildDetail["attendanceHistory"];
}) {
  if (records.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 text-center">
        <CalendarCheck className="h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-medium text-foreground">No attendance records</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Attendance history will appear here once sessions are completed.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {records.map((record) => (
        <Card key={record.session_id} className="flex items-center justify-between p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{record.sport}</p>
            <p className="text-xs text-muted-foreground">{formatDate(record.date)}</p>
          </div>
          {record.present ? (
            <Badge className="gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
              <CheckCircle2 className="h-3 w-3" />
              Present
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 bg-red-50 text-red-700 hover:bg-red-50">
              <XCircle className="h-3 w-3" />
              Absent
            </Badge>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Assessments Tab                                                     */
/* ------------------------------------------------------------------ */

function AssessmentsTab({
  terms,
}: {
  terms: {
    term_name: string;
    term_id: string;
    entries: {
      sport: string;
      skills: { skill_name: string; rating: number }[];
      assessed_at: string;
    }[];
  }[];
}) {
  if (terms.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 text-center">
        <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-medium text-foreground">No assessments yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Skill assessments will appear here once completed by the coaching team.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {terms.map((term) => (
        <div key={term.term_id}>
          <h3 className="mb-3 text-sm font-semibold text-foreground">{term.term_name}</h3>
          <div className="space-y-3">
            {term.entries.map((entry, idx) => (
              <Card key={`${term.term_id}-${idx}`} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <Badge
                    variant="secondary"
                    className="bg-cyan-50 text-cyan-700 hover:bg-cyan-50"
                  >
                    {entry.sport}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(entry.assessed_at)}
                  </span>
                </div>
                <div className="space-y-2">
                  {entry.skills.map((skill) => (
                    <div
                      key={skill.skill_name}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-sm text-foreground truncate">
                        {skill.skill_name}
                      </span>
                      <StarRating rating={skill.rating} />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progression Tab                                                     */
/* ------------------------------------------------------------------ */

function ProgressionTab({
  data,
}: {
  data: {
    latestTerm: string;
    previousTerm: string;
    comparisons: {
      skill_name: string;
      previous_rating: number;
      current_rating: number;
      change: "improved" | "declined" | "same";
    }[];
  } | null;
}) {
  if (!data) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 text-center">
        <TrendingUp className="h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-medium text-foreground">Progression data coming soon</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Progression data will be available after the next assessment period.
        </p>
      </Card>
    );
  }

  if (data.comparisons.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 text-center">
        <TrendingUp className="h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-medium text-foreground">No comparable skills</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Skills assessed across terms need to overlap for progression tracking.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{data.previousTerm}</span>
        <ArrowUpRight className="h-3 w-3" />
        <span className="font-medium text-foreground">{data.latestTerm}</span>
      </div>

      <div className="space-y-2">
        {data.comparisons.map((comp) => (
          <Card key={comp.skill_name} className="flex items-center justify-between p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">
                {comp.skill_name}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <StarRating rating={comp.previous_rating} />
                <span className="text-muted-foreground/60">&rarr;</span>
                <StarRating rating={comp.current_rating} />
              </div>
            </div>
            <div className="ml-3 shrink-0">
              {comp.change === "improved" && (
                <div className="flex items-center gap-1 text-emerald-600">
                  <ArrowUpRight className="h-4 w-4" />
                  <span className="text-xs font-medium">Improved</span>
                </div>
              )}
              {comp.change === "declined" && (
                <div className="flex items-center gap-1 text-red-600">
                  <ArrowDownRight className="h-4 w-4" />
                  <span className="text-xs font-medium">Declined</span>
                </div>
              )}
              {comp.change === "same" && (
                <div className="flex items-center gap-1 text-gray-400">
                  <Minus className="h-4 w-4" />
                  <span className="text-xs font-medium">Same</span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Summary */}
      <Card className="bg-cyan-50 p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-bold text-emerald-600">
              {data.comparisons.filter((c) => c.change === "improved").length}
            </p>
            <p className="text-xs text-muted-foreground">Improved</p>
          </div>
          <div>
            <p className="text-lg font-bold text-gray-500">
              {data.comparisons.filter((c) => c.change === "same").length}
            </p>
            <p className="text-xs text-muted-foreground">Same</p>
          </div>
          <div>
            <p className="text-lg font-bold text-red-600">
              {data.comparisons.filter((c) => c.change === "declined").length}
            </p>
            <p className="text-xs text-muted-foreground">Declined</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
