"use client";

import { AlertTriangle, Calendar, Users, FileText } from "lucide-react";
import { AppLogo } from "@/components/shared/app-logo";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

interface SharedPortalViewProps {
  centreId: string;
  centreName: string;
  primaryUserName: string;
}

const placeholderSections = [
  {
    title: "Schedule",
    description:
      "View upcoming coaching sessions and timetable for your centre.",
    icon: Calendar,
  },
  {
    title: "Children",
    description: "See enrolled children and attendance records.",
    icon: Users,
  },
  {
    title: "Reports",
    description:
      "Access session reports, feedback, and programme summaries.",
    icon: FileText,
  },
];

export function SharedPortalView({
  centreName,
  primaryUserName,
}: SharedPortalViewProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Shared link warning banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>
            You&apos;re viewing a shared link &mdash; contact{" "}
            <span className="font-medium">{primaryUserName}</span> for full
            access
          </p>
        </div>
      </div>

      {/* Top bar */}
      <header className="border-b bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <AppLogo size="sm" />
          <span className="text-base font-semibold text-foreground">
            {centreName}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">{centreName}</h1>
          <p className="text-sm text-muted-foreground">
            This is a read-only view of the centre portal. Full features are
            available when you sign in.
          </p>
          <a
            href="/client-login"
            className="inline-block mt-2 text-sm font-medium text-[#0891B2] hover:underline"
          >
            Sign in for full access
          </a>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {placeholderSections.map((section) => {
            const Icon = section.icon;
            return (
              <Card key={section.title} className="rounded-2xl transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-[#0891B2]" />
                    <CardTitle>{section.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {section.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
