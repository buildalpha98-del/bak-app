"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  PartyPopper,
  ClipboardCheck,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  getCentreProfileChecklist,
  type ProfileChecklist,
} from "@/lib/crm/trial-actions";

// ============================================================
// Checklist items config
// ============================================================

const CHECKLIST_ITEMS: {
  key: keyof Omit<ProfileChecklist, "isComplete">;
  label: string;
}[] = [
  { key: "pricingModelSet", label: "Pricing model set" },
  { key: "agreedRateSet", label: "Agreed rate set" },
  { key: "sessionPreferencesSet", label: "Session preferences set" },
  { key: "operationalNotesAdded", label: "Operational notes added" },
];

// ============================================================
// Loading Skeleton
// ============================================================

function ChecklistSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-44" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component
// ============================================================

interface ProfileChecklistViewProps {
  centreId: string;
}

export function ProfileChecklistView({ centreId }: ProfileChecklistViewProps) {
  const [data, setData] = useState<ProfileChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const result = await getCentreProfileChecklist(centreId);
      if (cancelled) return;

      if (result.error) {
        setError(result.error);
      } else {
        setData(result.data);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [centreId]);

  if (loading) return <ChecklistSkeleton />;

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <AlertCircle className="size-6 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                setError(null);
                getCentreProfileChecklist(centreId).then((r) => {
                  if (r.error) setError(r.error);
                  else setData(r.data);
                  setLoading(false);
                });
              }}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Hide when all items are complete
  if (!data || data.isComplete) return null;

  const completedCount = CHECKLIST_ITEMS.filter(
    (item) => data[item.key]
  ).length;

  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="size-4 text-primary" />
          Profile Checklist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{
                width: `${(completedCount / CHECKLIST_ITEMS.length) * 100}%`,
              }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {completedCount} of {CHECKLIST_ITEMS.length} complete
          </span>
        </div>

        {/* Checklist items */}
        <ul className="space-y-2.5">
          {CHECKLIST_ITEMS.map((item) => {
            const isChecked = data[item.key];
            return (
              <li key={item.key} className="flex items-center gap-3 min-h-[44px]">
                {isChecked ? (
                  <CheckCircle2 className="size-5 shrink-0 text-green-600" />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground/30" />
                )}
                <span
                  className={`text-sm ${
                    isChecked
                      ? "text-foreground line-through decoration-muted-foreground/40"
                      : "text-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
