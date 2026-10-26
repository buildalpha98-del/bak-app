import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from "lucide-react";
import type { CoachPayRateDisplay } from "@/lib/pay-rates/actions";
import type { SessionType } from "@/lib/types/enums";

const LABELS: Record<SessionType, string> = {
  childcare: "Childcare", school_local: "School (Local)",
  school_travel: "School (Travel)", holiday_clinic: "Holiday Clinic",
};

// Audit §2.9: rates are staff-managed payroll inputs, not coach-editable fields.
export function CoachPayRates({ initialDefaultRate, initialRates }: {
  initialDefaultRate: number | null;
  initialRates: CoachPayRateDisplay[];
}) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h2 className="flex items-center gap-2 font-semibold"><DollarSign className="h-5 w-5" />Pay rates</h2>
        <p className="text-sm text-muted-foreground">Rates are managed by your administrator. Contact them to request a correction. Use the hours adjustment form on Invoicing to request a change to a completed shift.</p>
        <p className="text-sm">Default rate: {initialDefaultRate === null ? "Not set" : `$${initialDefaultRate.toFixed(2)}`}</p>
        {initialRates.map(rate => (
          <div key={rate.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-3 text-sm">
            <div><span className="font-medium">{LABELS[rate.session_type]}</span><p className="text-muted-foreground">Effective {rate.effective_from}</p></div>
            <Badge variant="secondary">${rate.rate.toFixed(2)} / {rate.rate_unit === "per_hour" ? "hour" : "session"}</Badge>
          </div>
        ))}
        {!initialRates.length && <p className="text-sm text-muted-foreground">No session-specific rates set.</p>}
      </CardContent>
    </Card>
  );
}
