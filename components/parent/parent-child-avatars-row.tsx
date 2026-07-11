"use client";

// ============================================================
// Parent home — child avatars row
// ============================================================
//
// A horizontal scroll of the parent's kids rendered as initial-only
// avatars with the child's name underneath. Clicking jumps to that
// child's detail page. Keeps the dashboard warm and personal —
// "these are my kids, not a row in a table".

import Link from "next/link";
import type { Child } from "@/lib/types/database";
import { calculateAge } from "@/lib/utils/ageGroup";

interface ParentChildAvatarsRowProps {
  children: Child[];
}

export function ParentChildAvatarsRow({
  children,
}: ParentChildAvatarsRowProps) {
  return (
    <div className="flex items-end gap-4 overflow-x-auto pb-1 -mx-1 px-1">
      {children.map((child) => {
        const age = child.date_of_birth
          ? calculateAge(new Date(child.date_of_birth))
          : null;
        const initials = `${child.first_name[0] ?? ""}${child.last_name[0] ?? ""}`;

        return (
          <Link
            key={child.id}
            href={`/parent/kids/${child.id}`}
            className="group flex flex-col items-center min-w-[68px] gap-1.5"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-primary text-base font-bold border-2 border-transparent group-hover:border-primary/40 transition-all">
              {initials}
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-[#1A1A1A] truncate max-w-[68px]">
                {child.first_name}
              </p>
              {age !== null && (
                <p className="text-[10px] text-[#666666]">{age}y</p>
              )}
            </div>
          </Link>
        );
      })}
      <Link
        href="/parent/kids"
        className="group flex flex-col items-center min-w-[68px] gap-1.5"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-orange-200 text-primary text-xl font-bold group-hover:border-primary/60 transition-all">
          +
        </div>
        <p className="text-xs font-medium text-[#666666] truncate max-w-[68px]">
          Add kid
        </p>
      </Link>
    </div>
  );
}
