"use client";

import Link from "@/components/ui/app-link";
import { calculateAge } from "@/lib/utils/ageGroup";
import type { Child } from "@/lib/types/database";
import { ChevronRight, AlertCircle } from "lucide-react";

interface ChildCardProps {
  child: Child;
}

const AGE_GROUP_COLORS: Record<string, string> = {
  "3-5": "bg-green-100 text-green-700",
  "5-8": "bg-blue-100 text-blue-700",
  "8-12": "bg-purple-100 text-purple-700",
};

export function ChildCard({ child }: ChildCardProps) {
  const age = child.date_of_birth
    ? calculateAge(new Date(child.date_of_birth))
    : null;

  return (
    <Link
      href={`/parent/kids/${child.id}`}
      className="group flex items-center gap-4 rounded-xl bg-card p-4 border border-orange-100 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
    >
      {/* Avatar */}
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-primary text-lg font-bold flex-shrink-0">
        {child.first_name[0]}
        {child.last_name[0]}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground truncate">
          {child.first_name} {child.last_name}
        </h3>
        <div className="flex items-center gap-2 mt-0.5">
          {age !== null && (
            <span className="text-sm text-muted-foreground">
              {age} years old
            </span>
          )}
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${AGE_GROUP_COLORS[child.age_group] ?? "bg-gray-100 text-gray-700"}`}
          >
            Ages {child.age_group}
          </span>
        </div>
        {child.medical_notes && (
          <div className="flex items-center gap-1 mt-1">
            <AlertCircle className="h-3 w-3 text-amber-500" />
            <span className="text-xs text-amber-600 truncate">
              Medical notes
            </span>
          </div>
        )}
      </div>

      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
    </Link>
  );
}
