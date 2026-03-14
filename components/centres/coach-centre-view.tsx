"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  GraduationCap,
  MapPin,
  Phone,
  Mail,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import type { CoachCentreDetail } from "@/lib/centres/actions";

function formatCentreType(type: string): string {
  return type === "childcare_centre" ? "Childcare Centre" : "School";
}

function formatNoteCategory(category: string): string {
  switch (category) {
    case "general":
      return "General";
    case "access_logistics":
      return "Access & Logistics";
    case "safety":
      return "Safety";
    default:
      return category;
  }
}

function noteCategoryVariant(
  category: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (category) {
    case "safety":
      return "destructive";
    case "access_logistics":
      return "secondary";
    default:
      return "outline";
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface CoachCentreViewProps {
  data: CoachCentreDetail;
}

export function CoachCentreView({ data }: CoachCentreViewProps) {
  const { centre, notes } = data;
  const TypeIcon =
    centre.type === "childcare_centre" ? Building2 : GraduationCap;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/coach" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <TypeIcon className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">
              {centre.name}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatCentreType(centre.type)}
          </p>
        </div>
      </div>

      {/* Contact & Location */}
      <Card>
        <CardHeader>
          <CardTitle>Contact & Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {centre.address && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 text-muted-foreground" />
              <span>{centre.address}</span>
            </div>
          )}
          {centre.primary_contact_name && (
            <div className="flex items-center gap-2">
              <Phone className="size-4 text-muted-foreground" />
              <span>{centre.primary_contact_name}</span>
            </div>
          )}
          {centre.primary_contact_phone && (
            <div className="flex items-center gap-2">
              <Phone className="size-4 text-muted-foreground" />
              <span>{centre.primary_contact_phone}</span>
            </div>
          )}
          {centre.primary_contact_email && (
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" />
              <span>{centre.primary_contact_email}</span>
            </div>
          )}
          {centre.age_groups.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground">Age Groups</p>
              <p className="font-medium">{centre.age_groups.join(", ")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Operational Notes (no client_relationship) */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <StickyNote className="size-5" />
          Operational Notes
        </h2>
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
            <StickyNote className="mb-3 size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No operational notes for this centre
            </p>
          </div>
        ) : (
          notes.map((note) => (
            <Card key={note.id} size="sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant={noteCategoryVariant(note.category)}>
                    {formatNoteCategory(note.category)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(note.created_at)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
