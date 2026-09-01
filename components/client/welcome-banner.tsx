"use client";

// ============================================================
// First-login welcome — one-time orientation for new directors
// ============================================================
//
// Shown until dismissed; the flag lives on client_users.welcomed_at
// so it never reappears on another device. Three steps, one tap out.

import { useState, useTransition } from "react";
import Link from "@/components/ui/app-link";
import { Calendar, FileText, MessageSquare, X } from "lucide-react";
import { markClientWelcomed } from "@/lib/client/actions";

const STEPS = [
  {
    icon: Calendar,
    title: "Your schedule",
    body: "Every upcoming session, who's coaching, and what the kids will be working on.",
  },
  {
    icon: FileText,
    title: "Reports & impact",
    body: "Term reports, skill progression and attendance — ready to share with families and committees.",
  },
  {
    icon: MessageSquare,
    title: "Message us anytime",
    body: "Questions, changes, feedback — the Messages tab goes straight to the Build Alpha Kids team.",
  },
];

export function WelcomeBanner({
  centreId,
  firstName,
}: {
  centreId: string;
  firstName: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    startTransition(async () => {
      await markClientWelcomed(centreId);
    });
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-portal-200 bg-gradient-to-br from-portal-50 to-white p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="absolute right-3 top-3 rounded-lg p-2 text-portal-700/60 transition hover:bg-portal-100 hover:text-portal-800"
      >
        <X className="h-4 w-4" />
      </button>

      <p className="text-xs font-semibold uppercase tracking-widest text-portal-700">
        Welcome to your portal
      </p>
      <h2 className="mt-1 text-lg font-bold text-foreground">
        G&apos;day {firstName} — here&apos;s your centre at a glance
      </h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.title} className="rounded-xl bg-card/70 p-3">
              <Icon className="h-5 w-5 text-portal-600" />
              <p className="mt-1.5 text-sm font-semibold text-foreground">
                {s.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/client/${centreId}/schedule`}
          className="rounded-lg bg-portal-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-portal-700"
        >
          See this week&apos;s sessions
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg px-3.5 py-2 text-sm font-medium text-portal-700 transition hover:bg-portal-100"
        >
          Got it, thanks
        </button>
      </div>
    </div>
  );
}
