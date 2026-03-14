"use client";

import Link from "next/link";
import {
  Building2,
  GraduationCap,
  MapPin,
  Phone,
  Mail,
  StickyNote,
  Calendar,
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
      <Card size="sm">
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

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <TypeIcon className="size-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{centre.name}</CardTitle>
            <CardDescription>{formatCentreType(centre.type)}</CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant={contractStatusVariant(centre.contract_status)}>
            {formatContractStatus(centre.contract_status)}
          </Badge>
          <Badge variant="outline">{formatPricingModel(centre.pricing_model)}</Badge>
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
