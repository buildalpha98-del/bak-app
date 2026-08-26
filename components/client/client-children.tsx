"use client";

import { useState } from "react";
import Link from "@/components/ui/app-link";
import { Search, Users, CalendarCheck, Percent } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ClientChild } from "@/lib/client/portal-actions";

const AGE_GROUPS = ["All", "3-5", "5-8", "8-12"] as const;

interface ClientChildrenProps {
  children: ClientChild[];
  centreId: string;
  /** Schools see "students"; childcare centres see "children". */
  isSchool?: boolean;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ClientChildren({
  children,
  centreId,
  isSchool = false,
}: ClientChildrenProps) {
  const noun = isSchool ? "student" : "child";
  const nounPlural = isSchool ? "students" : "children";
  const heading = isSchool ? "Students" : "Children";
  const [search, setSearch] = useState("");
  const [ageFilter, setAgeFilter] = useState<string>("All");

  const filtered = children.filter((child) => {
    const fullName = `${child.first_name} ${child.last_name}`.toLowerCase();
    const matchesSearch = search === "" || fullName.includes(search.toLowerCase());
    const matchesAge = ageFilter === "All" || child.age_group === ageFilter;
    return matchesSearch && matchesAge;
  });

  return (
    <div className="animate-fade-up space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">{heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {children.length} enrolled {children.length === 1 ? noun : nounPlural}
        </p>
      </div>

      {/* Search and filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          {AGE_GROUPS.map((group) => (
            <Button
              key={group}
              variant={ageFilter === group ? "default" : "outline"}
              size="sm"
              onClick={() => setAgeFilter(group)}
              className={
                ageFilter === group
                  ? "rounded-2xl bg-[#0891B2] text-white hover:bg-[#0891B2]/90"
                  : "rounded-2xl text-muted-foreground"
              }
            >
              {group === "All" ? "All Ages" : `${group} yrs`}
            </Button>
          ))}
        </div>
      </div>

      {/* Children list */}
      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center rounded-2xl p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0891B2]/10">
            <Users className="h-6 w-6 text-[#0891B2]" />
          </div>
          <h3 className="mt-4 text-sm font-medium text-foreground">
            {children.length === 0
              ? `No ${nounPlural} enrolled`
              : `No ${nounPlural} match your filters`}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {children.length === 0
              ? `Enrolled ${nounPlural} will appear here once added by your ${isSchool ? "school" : "centre"}.`
              : "Try adjusting your search or age group filter."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((child) => (
            <Link
              key={child.id}
              href={`/client/${centreId}/children/${child.id}`}
              className="block"
            >
              <Card className="rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-md active:shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {child.first_name} {child.last_name}
                    </h3>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0 bg-cyan-50 text-cyan-700 hover:bg-cyan-50"
                  >
                    {child.age_group} yrs
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-1.5">
                    <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {child.sessions_attended}/{child.total_sessions} sessions
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {child.attendance_percentage}% attendance
                    </span>
                  </div>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  Last attended: {formatDate(child.last_attended)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
