"use client";

// ============================================================
// CentreCard
// ============================================================
//
// Card used by the grid view at /admin/centres and /ops/centres. The
// May 2026 refresh adds:
//   - a small health-status dot in the header (green/amber/red),
//     anchored top-right of the type-icon strip so the centre name
//     stays readable; tooltip shows the numeric score
//   - a red "At risk" badge when `centres.churn_risk = true`
//   - an onboarding progress badge ("Onboarding N/10") that links to
//     the centre's onboarding wizard
//   - rounded-2xl + subtle hover-lift, matching the /admin home cards

import Link from "next/link";
import {
  Building2,
  GraduationCap,
  MapPin,
  Phone,
  Mail,
  StickyNote,
  Calendar,
  AlertTriangle,
  Compass,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CentreListItem } from "@/lib/centres/actions";

// ============================================================
// Helpers
// ============================================================

function formatCentreType(type: string): string {
  return type === "childcare_centre" ? "Childcare Centre" : "School";
}

function formatPricingModel(model: string): string {
  switch (model) {
    case "centre_funded":
      return "Centre Funded";
    case "parent_funded":
      return "Parent Funded";
    case "per_head":
      return "Per Head";
    default:
      return model;
  }
}

function contractStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "trial":
      return "secondary";
    case "paused":
      return "outline";
    case "churned":
      return "destructive";
    default:
      return "outline";
  }
}

function formatContractStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Map health score to the three-tier visual band used for the dot.
 * Thresholds match the cron's `health_status` enum buckets — keeping
 * them in sync means an admin who edits the cron thresholds doesn't
 * also have to update the card.
 */
function healthDotClass(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

// ============================================================
// CentreCard — full variant (admin/ops card grid)
// ============================================================

interface CentreCardProps {
  centre: CentreListItem;
  basePath: string; // "/admin/centres" or "/ops/centres"
  variant?: "full" | "compact";
}

export function CentreCard({
  centre,
  basePath,
  variant = "full",
}: CentreCardProps) {
  const TypeIcon =
    centre.type === "childcare_centre" ? Building2 : GraduationCap;

  if (variant === "compact") {
    return (
      <Card size="sm" className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TypeIcon className="size-4 text-muted-foreground" />
            <CardTitle className="truncate">{centre.name}</CardTitle>
          </div>
          <CardDescription className="truncate">
            {centre.address ?? "No address"}
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          <Button variant="ghost" size="sm" render={<Link href={`${basePath}/${centre.id}`} />}>
            View
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Onboarding badge variants:
  //  - has checklist row → "Onboarding N/10" with Compass icon
  //  - no row, profile incomplete → "Onboarding pending"
  //  - profile complete → no badge
  const onboardingBadge =
    centre.onboarding_steps_total !== null &&
    centre.onboarding_steps_completed !== null &&
    !centre.profile_checklist_complete ? (
      <Link
        href={`${basePath}/${centre.id}/onboarding`}
        className="contents"
      >
        <Badge variant="secondary" className="gap-1 hover:bg-secondary/80">
          <Compass className="size-3" />
          Onboarding {centre.onboarding_steps_completed}/
          {centre.onboarding_steps_total}
        </Badge>
      </Link>
    ) : !centre.profile_checklist_complete ? (
      <Link
        href={`${basePath}/${centre.id}/onboarding`}
        className="contents"
      >
        <Badge variant="secondary" className="gap-1 hover:bg-secondary/80">
          <Compass className="size-3" />
          Onboarding pending
        </Badge>
      </Link>
    ) : null;

  return (
    <Card className="flex flex-col rounded-2xl transition hover:shadow-md hover:-translate-y-0.5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
            <TypeIcon className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{centre.name}</CardTitle>
            <CardDescription>{formatCentreType(centre.type)}</CardDescription>
          </div>
          {/* Health dot — small, top-right; tooltip reveals the score. */}
          {centre.health_score !== null && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Health score ${centre.health_score}`}
                      className={
                        "size-2.5 shrink-0 rounded-full " +
                        healthDotClass(centre.health_score)
                      }
                    />
                  }
                />
                <TooltipContent>
                  Health score: {centre.health_score}/100
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant={contractStatusVariant(centre.contract_status)}>
            {formatContractStatus(centre.contract_status)}
          </Badge>
          {centre.churn_risk && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="size-3" />
              At risk
            </Badge>
          )}
          <Badge variant="outline">{formatPricingModel(centre.pricing_model)}</Badge>
          {onboardingBadge}
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-2 text-sm text-muted-foreground">
        {centre.address && (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2">{centre.address}</span>
          </div>
        )}
        {centre.primary_contact_name && (
          <div className="flex items-center gap-2">
            <Phone className="size-3.5 shrink-0" />
            <span className="truncate">{centre.primary_contact_name}</span>
          </div>
        )}
        {centre.primary_contact_email && (
          <div className="flex items-center gap-2">
            <Mail className="size-3.5 shrink-0" />
            <span className="truncate">{centre.primary_contact_email}</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between">
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <StickyNote className="size-3" />
            {centre.note_count} notes
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            {centre.session_count} sessions
          </span>
        </div>
        <Button variant="ghost" size="sm" render={<Link href={`${basePath}/${centre.id}`} />}>
          View
        </Button>
      </CardFooter>
    </Card>
  );
}
