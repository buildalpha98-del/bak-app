"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const SEGMENT_LABELS: Record<string, string> = {
  admin: "Dashboard",
  ops: "Command Centre",
  coach: "Home",
  centres: "Centres & Schools",
  roster: "Roster",
  staff: "Staff",
  programs: "Programs",
  equipment: "Equipment",
  documents: "Documents",
  forms: "Forms",
  invoicing: "Invoicing",
  tasks: "Tasks",
  announcements: "Announcements",
  settings: "Settings",
  schedule: "Schedule",
  docs: "Docs",
  profile: "Profile",
};

function formatSegment(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** UUID v4 (Postgres `gen_random_uuid()` shape) — used as the detail-page
 *  segment for centres, leads, sessions, etc. We skip these because they're
 *  not human-readable, and the parent crumb already conveys "you're inside
 *  this section". A future enhancement could let pages publish an entity
 *  name to substitute in here, but dropping is strictly better than leaking
 *  the raw UUID. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Breadcrumbs() {
  const pathname = usePathname();
  const allSegments = pathname.split("/").filter(Boolean);

  if (allSegments.length <= 1) return null;

  const crumbs: { label: string; href: string }[] = [];
  allSegments.forEach((segment, index) => {
    if (UUID_REGEX.test(segment)) return;
    crumbs.push({
      label: formatSegment(segment),
      href: "/" + allSegments.slice(0, index + 1).join("/"),
    });
  });

  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5 text-sm">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <div key={crumb.href} className="flex items-center gap-1.5">
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
            {isLast ? (
              <span className="font-semibold text-foreground">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                {crumb.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
