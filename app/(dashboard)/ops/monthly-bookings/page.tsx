import { LoadError } from "@/components/ui/load-error";
import { MonthBookingsView } from "@/components/roster/month-bookings-view";
import { getMonthBookings } from "@/lib/roster/month-bookings-actions";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

// Monthly bookings: every school and centre's sessions for one month.
export const dynamic = "force-dynamic";

export default async function MonthBookingsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const { data, error } = await getMonthBookings(month);
  if (error || !data) return <LoadError message={error ?? "Failed to load this month's bookings."} />;
  return (
    <MonthBookingsView
      bookings={data.bookings}
      financialAccess={data.financialAccess}
      thisMonth={sydneyTodayIso().slice(0, 7)}
      basePath="/ops/roster"
      pagePath="/ops/monthly-bookings"
    />
  );
}
