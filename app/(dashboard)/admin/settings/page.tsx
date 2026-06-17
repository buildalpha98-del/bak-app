// ============================================================
// Admin Settings index
// ============================================================
//
// Final-batch refresh: settings is a category index — pulse counts
// don't fit here, so we surface the same set of sub-routes as a
// clean rounded-2xl card grid with restrained orange iconography
// (chip-style accent on hover rather than colourful per-card tints
// that competed with each other).
//
// Sub-routes themselves (forecasting / health-scores / regions /
// integrations / invoicing / reminders / scheduling / programs)
// keep their own per-page treatments.

import Link from "next/link";
import {
  Heart,
  LineChart,
  Calendar,
  MapPin,
  Link2,
  Receipt,
  Bell,
  Boxes,
  ChevronRight,
} from "lucide-react";

const settingsSections = [
  {
    label: "Health Score Config",
    description: "Adjust weights for centre health score calculation",
    href: "/admin/settings/health-scores",
    icon: Heart,
  },
  {
    label: "Revenue Forecasting",
    description: "Configure conversion rates and seasonal factors",
    href: "/admin/settings/forecasting",
    icon: LineChart,
  },
  {
    label: "Scheduling Preferences",
    description: "AI scheduler weights and constraint settings",
    href: "/admin/settings/scheduling",
    icon: Calendar,
  },
  {
    label: "Regions",
    description: "Manage region definitions and suburb assignments",
    href: "/admin/settings/regions",
    icon: MapPin,
  },
  {
    label: "Integrations",
    description: "External service connections and API keys",
    href: "/admin/settings/integrations",
    icon: Link2,
  },
  {
    label: "Invoicing",
    description: "Business details, payment terms, and invoice settings",
    href: "/admin/settings/invoicing",
    icon: Receipt,
  },
  {
    label: "Session Reminders",
    description: "Automated 24-hour reminders for parents and coaches",
    href: "/admin/settings/reminders",
    icon: Bell,
  },
  {
    label: "Custom Sports & Equipment",
    description: "Org-wide custom sports and equipment items for program generation",
    href: "/admin/settings/programs",
    icon: Boxes,
  },
];

export default function SettingsPage() {
  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure platform settings, integrations, and business rules.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {settingsSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-2xl border bg-background p-5 transition hover:shadow-md hover:-translate-y-0.5"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/40 transition group-hover:bg-[#E8712A]/10">
                <section.icon className="h-5 w-5 text-muted-foreground transition group-hover:text-[#E8712A]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{section.label}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {section.description}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-hover:text-[#E8712A]" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
