import Link from "next/link";
import {
  Heart,
  LineChart,
  Calendar,
  MapPin,
  Link2,
  Receipt,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const settingsSections = [
  {
    label: "Health Score Config",
    description: "Adjust weights for centre health score calculation",
    href: "/admin/settings/health-scores",
    icon: Heart,
    colour: "text-rose-500 bg-rose-50",
  },
  {
    label: "Revenue Forecasting",
    description: "Configure conversion rates and seasonal factors",
    href: "/admin/settings/forecasting",
    icon: LineChart,
    colour: "text-blue-500 bg-blue-50",
  },
  {
    label: "Scheduling Preferences",
    description: "AI scheduler weights and constraint settings",
    href: "/admin/settings/scheduling",
    icon: Calendar,
    colour: "text-cyan-500 bg-cyan-50",
  },
  {
    label: "Regions",
    description: "Manage region definitions and suburb assignments",
    href: "/admin/settings/regions",
    icon: MapPin,
    colour: "text-emerald-500 bg-emerald-50",
  },
  {
    label: "Integrations",
    description: "External service connections and API keys",
    href: "/admin/settings/integrations",
    icon: Link2,
    colour: "text-purple-500 bg-purple-50",
  },
  {
    label: "Invoicing",
    description: "Business details, payment terms, and invoice settings",
    href: "/admin/settings/invoicing",
    icon: Receipt,
    colour: "text-amber-500 bg-amber-50",
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {settingsSections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-shadow hover:shadow-md cursor-pointer">
              <CardContent className="flex items-start gap-4 p-5">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${section.colour}`}
                >
                  <section.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {section.label}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {section.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
