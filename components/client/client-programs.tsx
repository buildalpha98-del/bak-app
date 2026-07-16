"use client";

import Link from "@/components/ui/app-link";
import {
  BookOpen,
  Calendar,
  Hash,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClientProgram } from "@/lib/client/portal-actions";

interface ClientProgramsProps {
  programs: ClientProgram[];
  centreId: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sportColour(sport: string): string {
  const colours: Record<string, string> = {
    Soccer: "bg-green-50 text-green-700 border-green-200",
    Basketball: "bg-orange-50 text-orange-700 border-orange-200",
    Athletics: "bg-red-50 text-red-700 border-red-200",
    Cricket: "bg-yellow-50 text-yellow-700 border-yellow-200",
    Tennis: "bg-lime-50 text-lime-700 border-lime-200",
    Swimming: "bg-blue-50 text-blue-700 border-blue-200",
    Netball: "bg-purple-50 text-purple-700 border-purple-200",
    Dance: "bg-pink-50 text-pink-700 border-pink-200",
    Gymnastics: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
    Hockey: "bg-teal-50 text-teal-700 border-teal-200",
    Yoga: "bg-indigo-50 text-indigo-700 border-indigo-200",
    "Multi-Sport": "bg-cyan-50 text-cyan-700 border-cyan-200",
  };
  return colours[sport] ?? "bg-gray-50 text-gray-700 border-gray-200";
}

export function ClientPrograms({ programs, centreId }: ClientProgramsProps) {
  if (programs.length === 0) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold font-heading text-foreground">Programs</h1>
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-card p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0891B2]/10">
            <BookOpen className="h-6 w-6 text-[#0891B2]" />
          </div>
          <h3 className="mt-4 text-sm font-medium text-gray-900">No programs yet</h3>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            Programs delivered at your centre will appear here once sessions are
            completed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-bold font-heading text-foreground">Programs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Here&apos;s what your children have been learning.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {programs.map((program) => (
          <Card
            key={program.id}
            className="group rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <Badge
                  variant="outline"
                  className={sportColour(program.sport)}
                >
                  {program.sport}
                </Badge>
                {program.age_group && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Users className="h-3 w-3" />
                    {program.age_group}
                  </span>
                )}
              </div>
              <h3 className="mt-2 text-sm font-semibold text-gray-900 line-clamp-2">
                {program.skill_focus || program.sport}
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Last: {formatDate(program.last_delivered)}
                </span>
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  {program.times_used} {program.times_used === 1 ? "session" : "sessions"}
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full rounded-2xl border-[#0891B2]/30 text-[#0891B2] hover:bg-[#0891B2]/10"
                render={(props) => (
                  <Link
                    {...props}
                    href={`/client/${centreId}/programs/${program.id}`}
                  />
                )}
              >
                View Program
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
