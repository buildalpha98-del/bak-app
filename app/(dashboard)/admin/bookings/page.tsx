"use client";

// ============================================================
// Admin Bookings Dashboard
// ============================================================
//
// Mirrors the design language of the centres / roster / CRM refresh
// (commits 94cfba3 / 91b383e / 7456360):
//   - inline status pulse strip above the page header
//   - URL-persisted tab state (?tab=sessions|bookings|packages|revenue)
//   - URL-persisted filter chips with jump-clear chips
//   - bulk-select with sticky BulkActionBar (rounded-2xl, brand-orange ring)
//   - `useCountUp` on summary numbers so they tick into place
//   - rounded-2xl, restrained orange (#E8712A) accents

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "@/components/ui/app-link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  getAdminBookingSummary,
  getAdminBookingsList,
  getAdminSessionsList,
  getAdminPackageBalances,
  getAdminRevenueBreakdown,
  exportBookingsCSV,
  toggleSessionStatus,
  getSessionsForDropdown,
  bulkCancelBookings,
  bulkActivateSessions,
  bulkPublishSessions,
} from "@/lib/bookings/admin-booking-actions";
import type {
  AdminBookingSummary,
  AdminBookingRow,
  AdminSessionRow,
  AdminPackageSummary,
  AdminRevenueBreakdown,
  AdminBookingFilters,
} from "@/lib/bookings/admin-booking-actions";
import { getBookingsStatusPulse } from "@/lib/bookings/status-pulse-actions";
import type { BookingsStatusPulse } from "@/lib/bookings/status-pulse-actions";
import { BookingsStatusPulseStrip } from "@/components/bookings/bookings-status-pulse";
import { useCountUp } from "@/components/launch/use-count-up";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CalendarDays,
  DollarSign,
  Users,
  Clock,
  Download,
  Eye,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Package,
  TrendingUp,
  BarChart3,
  Trophy,
  X,
  CircleCheck,
  CircleSlash,
  Megaphone,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { SPORTS } from "@/lib/types/enums";

// ============================================================
// Helpers
// ============================================================

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "confirmed":
    case "active":
    case "open":
    case "completed":
      return "border-green-200 text-green-700 bg-green-50";
    case "pending_payment":
    case "draft":
    case "offered":
    case "waiting":
      return "border-amber-200 text-amber-700 bg-amber-50";
    case "cancelled":
    case "closed":
    case "refunded":
    case "no_show":
    case "expired":
    case "used_up":
      return "border-red-200 text-red-700 bg-red-50";
    default:
      return "border-gray-200 text-gray-600 bg-gray-50";
  }
}

function statusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  holiday_clinic: "Holiday Clinic",
  after_school: "After School",
  weekend: "Weekend",
  specialist: "Specialist",
  other: "Other",
};

const TAB_VALUES = ["sessions", "bookings", "packages", "revenue"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTab(v: string | null): v is TabValue {
  return v !== null && (TAB_VALUES as readonly string[]).includes(v);
}

/** Convert YYYY-MM-DD into Monday of that week. */
function mondayIsoOf(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ============================================================
// Animated metric (ticks up on first paint)
// ============================================================

function AnimatedMetric({ value }: { value: number }) {
  const ticked = useCountUp(value);
  return <>{ticked}</>;
}

function AnimatedCurrency({ cents }: { cents: number }) {
  const tickedDollars = useCountUp(Math.round(cents / 100));
  return <>${tickedDollars.toLocaleString()}</>;
}

// ============================================================
// Main Component
// ============================================================

export default function AdminBookingsDashboard() {
  const router = useRouter();
  const params = useSearchParams();

  // ============================================================
  // URL-backed tab state
  // ============================================================
  const initialTab: TabValue = isTab(params.get("tab"))
    ? (params.get("tab") as TabValue)
    : "sessions";
  const [activeTab, setActiveTabState] = useState<TabValue>(initialTab);

  // Sync activeTab from URL when navigation comes from outside (eg
  // pulse jump-link, browser back/forward). The local setter still
  // writes back to URL for inline tab switches.
  const urlTab = params.get("tab");
  useEffect(() => {
    const target = isTab(urlTab) ? (urlTab as TabValue) : "sessions";
    setActiveTabState((prev) => (prev === target ? prev : target));
  }, [urlTab]);

  const replaceParam = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(Array.from(params.entries()));
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "all" && value !== "") {
          next.set(key, value);
        } else {
          next.delete(key);
        }
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router]
  );

  function setActiveTab(v: string) {
    if (!isTab(v)) return;
    setActiveTabState(v);
    replaceParam({ tab: v === "sessions" ? null : v });
  }

  // ============================================================
  // Pulse strip
  // ============================================================
  const [pulse, setPulse] = useState<BookingsStatusPulse>({
    todaysSessionsCount: 0,
    waitlistExpiringCount: 0,
    packagesLowCount: 0,
    newBookingsThisWeekCount: 0,
  });

  // ============================================================
  // Data state
  // ============================================================
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AdminBookingSummary | null>(null);
  const [sessions, setSessions] = useState<AdminSessionRow[]>([]);
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [packageData, setPackageData] = useState<AdminPackageSummary | null>(null);
  const [revenueData, setRevenueData] = useState<AdminRevenueBreakdown | null>(null);
  const [togglingSession, setTogglingSession] = useState<string | null>(null);
  const [sessionOptions, setSessionOptions] = useState<
    { id: string; title: string; date: string }[]
  >([]);
  const [exporting, setExporting] = useState(false);
  const [revenueChartView, setRevenueChartView] = useState<
    "session_type" | "suburb" | "sport"
  >("session_type");
  const [error, setError] = useState<string | null>(null);

  // ============================================================
  // URL-backed bookings filters
  // ============================================================
  const bookingFilters: AdminBookingFilters = useMemo(() => {
    return {
      session_id: params.get("session_id") ?? undefined,
      date_from: params.get("date_from") ?? undefined,
      date_to: params.get("date_to") ?? undefined,
      status: params.get("status") ?? undefined,
      payment_type: params.get("payment_type") ?? undefined,
    };
  }, [params]);

  const bookingsRange = params.get("range"); // "this_week" jump from pulse

  // ============================================================
  // URL-backed sessions filters
  // ============================================================
  const sessionStatusFilter = params.get("session_status") ?? "all";
  const sessionSportFilter = params.get("sport") ?? "all";
  const sessionPeriodFilter = params.get("period") ?? "all"; // today, this_week, all
  const sessionWaitlistFilter = params.get("waitlist"); // "expiring"
  const sessionDateFilter = params.get("date"); // "today"

  // ============================================================
  // Packages filter
  // ============================================================
  const packagesLowFilter = params.get("low") === "yes";

  // Selection state per tab (each is independent so switching tabs
  // doesn't collapse the user's in-flight bulk pick).
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    new Set()
  );
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(
    new Set()
  );

  // ============================================================
  // Initial load
  // ============================================================
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [summaryRes, pulseRes] = await Promise.all([
        getAdminBookingSummary(),
        getBookingsStatusPulse(),
      ]);
      if (summaryRes.data) setSummary(summaryRes.data);
      if (summaryRes.error) setError(summaryRes.error);
      setPulse(pulseRes);
      setLoading(false);
    }
    load();
  }, []);

  // ============================================================
  // Tab data loaders
  // ============================================================
  const loadSessions = useCallback(async () => {
    const { data, error: err } = await getAdminSessionsList();
    if (data) setSessions(data);
    if (err) setError(err);
  }, []);

  const loadBookings = useCallback(async () => {
    const [bookingsResult, sessionsResult] = await Promise.all([
      getAdminBookingsList(bookingFilters),
      getSessionsForDropdown(),
    ]);
    if (bookingsResult.data) setBookings(bookingsResult.data);
    if (sessionsResult.data) setSessionOptions(sessionsResult.data);
    if (bookingsResult.error) setError(bookingsResult.error);
  }, [bookingFilters]);

  const loadPackages = useCallback(async () => {
    const { data, error: err } = await getAdminPackageBalances();
    if (data) setPackageData(data);
    if (err) setError(err);
  }, []);

  const loadRevenue = useCallback(async () => {
    const { data, error: err } = await getAdminRevenueBreakdown();
    if (data) setRevenueData(data);
    if (err) setError(err);
  }, []);

  useEffect(() => {
    setError(null);
    if (activeTab === "sessions") loadSessions();
    else if (activeTab === "bookings") loadBookings();
    else if (activeTab === "packages") loadPackages();
    else if (activeTab === "revenue") loadRevenue();
  }, [activeTab, loadSessions, loadBookings, loadPackages, loadRevenue]);

  // Refetch pulse after a successful bulk action so the numbers reflect
  // the new state.
  async function refreshPulse() {
    const p = await getBookingsStatusPulse();
    setPulse(p);
  }

  // ============================================================
  // Filter setters (URL-persisted)
  // ============================================================
  // base-ui Select calls back with `string | null`; we normalise here
  // so the URL writer + AdminBookingFilters never see a stray `null`.
  function setBookingFilter(
    key: keyof AdminBookingFilters,
    value: string | null | undefined
  ) {
    replaceParam({ [key]: value ?? null });
  }

  function clearJumpFilter(key: string) {
    replaceParam({ [key]: null });
  }

  // ============================================================
  // Toggle session open/close
  // ============================================================
  async function handleToggleSession(sessionId: string, currentStatus: string) {
    setTogglingSession(sessionId);
    const { error: err } = await toggleSessionStatus(sessionId, currentStatus);
    if (err) {
      toast.error(err);
    } else {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, status: s.status === "open" ? "closed" : "open" }
            : s
        )
      );
      void refreshPulse();
    }
    setTogglingSession(null);
  }

  // Export CSV (passes URL filters through)
  async function handleExportCSV() {
    setExporting(true);
    const { data: csv, error: err } = await exportBookingsCSV(bookingFilters);
    if (err) {
      toast.error(err);
    } else if (csv) {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bookings-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  // ============================================================
  // Derived sessions list (URL filters applied)
  // ============================================================
  const filteredSessions = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const mondayIso = mondayIsoOf().slice(0, 10);
    return sessions.filter((s) => {
      if (sessionStatusFilter !== "all" && s.status !== sessionStatusFilter) {
        return false;
      }
      if (sessionSportFilter !== "all" && s.sport !== sessionSportFilter) {
        return false;
      }
      if (sessionDateFilter === "today" && s.date !== todayIso) {
        return false;
      }
      if (sessionPeriodFilter === "today" && s.date !== todayIso) {
        return false;
      }
      if (
        sessionPeriodFilter === "this_week" &&
        (s.date < mondayIso || s.date > todayIso)
      ) {
        // "this_week" = Monday → today (inclusive)
        return false;
      }
      return true;
    });
  }, [
    sessions,
    sessionStatusFilter,
    sessionSportFilter,
    sessionPeriodFilter,
    sessionDateFilter,
  ]);

  // Derived bookings list (range jump from pulse + status normalization)
  const filteredBookings = useMemo(() => {
    let list = bookings;
    if (bookingsRange === "this_week") {
      const mondayIso = mondayIsoOf();
      list = list.filter(
        (b) =>
          b.status === "confirmed" &&
          new Date(b.booked_at).toISOString() >= mondayIso
      );
    }
    return list;
  }, [bookings, bookingsRange]);

  // Derived package balances (low jump)
  const filteredBalances = useMemo(() => {
    if (!packageData) return [];
    if (packagesLowFilter) {
      return packageData.balances.filter(
        (b) => b.status === "active" && b.remaining_sessions <= 2
      );
    }
    return packageData.balances;
  }, [packageData, packagesLowFilter]);

  // ============================================================
  // Bulk selection helpers
  // ============================================================
  function toggleSession(id: string) {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleBooking(id: string) {
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSessionIds = useMemo(
    () => filteredSessions.map((s) => s.id),
    [filteredSessions]
  );
  const allSessionsSelected =
    allSessionIds.length > 0 &&
    allSessionIds.every((id) => selectedSessionIds.has(id));

  const allBookingIds = useMemo(
    () => filteredBookings.map((b) => b.id),
    [filteredBookings]
  );
  const allBookingsSelected =
    allBookingIds.length > 0 &&
    allBookingIds.every((id) => selectedBookingIds.has(id));

  function toggleSelectAllSessions(checked: boolean) {
    if (!checked) return setSelectedSessionIds(new Set());
    setSelectedSessionIds(new Set(allSessionIds));
  }
  function toggleSelectAllBookings(checked: boolean) {
    if (!checked) return setSelectedBookingIds(new Set());
    setSelectedBookingIds(new Set(allBookingIds));
  }

  function getChartData() {
    if (!revenueData) return [];
    switch (revenueChartView) {
      case "session_type":
        return revenueData.bySessionType.map((d) => ({
          name: SESSION_TYPE_LABELS[d.name] ?? d.name,
          revenue: d.revenue / 100,
        }));
      case "suburb":
        return revenueData.bySuburb.map((d) => ({
          name: d.name,
          revenue: d.revenue / 100,
        }));
      case "sport":
        return revenueData.bySport.map((d) => ({
          name: d.name,
          revenue: d.revenue / 100,
        }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="space-y-6">
      {/* Pulse strip — sits above the page header */}
      <BookingsStatusPulseStrip
        pulse={pulse}
        basePath="/admin/bookings"
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Booking Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage parent bookings, sessions, packages, and revenue
          </p>
        </div>
        <Button
          render={<Link href="/admin/bookings/sessions/new" />}
          className="bg-primary text-white hover:bg-primary/90"
        >
          <CalendarDays className="size-4" />
          Create Session
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* Summary Cards — countUp values, neutral icon treatment */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Bookings This Week"
            icon={CalendarDays}
            value={<AnimatedMetric value={summary.bookingsThisWeek} />}
          />
          <SummaryCard
            label="Revenue This Week"
            icon={DollarSign}
            value={<AnimatedCurrency cents={summary.revenueThisWeek} />}
          />
          <SummaryCard
            label="Sessions With Capacity"
            icon={Users}
            value={<AnimatedMetric value={summary.sessionsWithCapacity} />}
          />
          <SummaryCard
            label="Active Waitlist"
            icon={Clock}
            value={<AnimatedMetric value={summary.activeWaitlist} />}
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* Sessions Tab */}
        {/* ============================================================ */}
        <TabsContent value="sessions" className="space-y-4">
          {/* Jump-filter chips (active filters from pulse links) */}
          {(sessionDateFilter === "today" ||
            sessionWaitlistFilter === "expiring") && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Filtered:</span>
              {sessionDateFilter === "today" && (
                <JumpChip
                  icon={CalendarDays}
                  label="Today's sessions only"
                  onClear={() => clearJumpFilter("date")}
                />
              )}
              {sessionWaitlistFilter === "expiring" && (
                <JumpChip
                  icon={Clock}
                  label={`${pulse.waitlistExpiringCount} waitlist offers expiring soon`}
                  onClear={() => clearJumpFilter("waitlist")}
                />
              )}
            </div>
          )}

          {/* Filter bar */}
          <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 sm:flex-row sm:items-center">
            <Select
              value={sessionStatusFilter}
              onValueChange={(v) =>
                replaceParam({ session_status: v === "all" ? null : v })
              }
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sessionSportFilter}
              onValueChange={(v) =>
                replaceParam({ sport: v === "all" ? null : v })
              }
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Sport" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sports</SelectItem>
                {SPORTS.map((sport) => (
                  <SelectItem key={sport} value={sport}>
                    {sport}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sessionPeriodFilter}
              onValueChange={(v) =>
                replaceParam({ period: v === "all" ? null : v })
              }
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="this_week">This week</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-2xl border bg-background overflow-hidden hover:shadow-md transition">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[36px]">
                    <Checkbox
                      checked={allSessionsSelected}
                      onCheckedChange={(c) =>
                        toggleSelectAllSessions(c === true)
                      }
                      aria-label="Select all visible"
                    />
                  </TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No bookable sessions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSessions.map((s) => {
                    const capacityPct =
                      s.max_capacity > 0
                        ? Math.round(
                            (s.current_bookings / s.max_capacity) * 100
                          )
                        : 0;
                    const selected = selectedSessionIds.has(s.id);

                    return (
                      <TableRow
                        key={s.id}
                        data-state={selected ? "selected" : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleSession(s.id)}
                            aria-label={`Select ${s.title}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">
                              {s.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {s.sport && `${s.sport} — `}
                              {s.suburb}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{formatDate(s.date)}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.start_time} - {s.end_time}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {SESSION_TYPE_LABELS[s.session_type] ??
                              s.session_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 min-w-[120px]">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>
                                {s.current_bookings}/{s.max_capacity}
                              </span>
                              <span>{capacityPct}%</span>
                            </div>
                            <Progress value={capacityPct} className="h-2" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCents(s.revenue)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(s.status)}
                          >
                            {statusLabel(s.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleToggleSession(s.id, s.status)
                              }
                              disabled={
                                togglingSession === s.id ||
                                !["open", "closed", "draft"].includes(s.status)
                              }
                              title={
                                s.status === "open"
                                  ? "Close bookings"
                                  : "Open bookings"
                              }
                            >
                              {togglingSession === s.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : s.status === "open" ? (
                                <ToggleRight className="size-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="size-4 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              render={
                                <Link
                                  href={`/admin/bookings/sessions/${s.id}`}
                                />
                              }
                            >
                              <Eye className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ============================================================ */}
        {/* Bookings Tab */}
        {/* ============================================================ */}
        <TabsContent value="bookings" className="space-y-4">
          {/* Jump chip — "this week" from pulse */}
          {bookingsRange === "this_week" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Filtered:</span>
              <JumpChip
                icon={TrendingUp}
                label="New bookings this week (confirmed)"
                onClear={() => clearJumpFilter("range")}
              />
            </div>
          )}

          {/* Filters */}
          <div className="rounded-2xl border bg-background p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Select
                value={bookingFilters.session_id ?? "all"}
                onValueChange={(v) =>
                  setBookingFilter("session_id", v === "all" ? undefined : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Sessions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sessions</SelectItem>
                  {sessionOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title} ({formatDate(s.date)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                placeholder="From date"
                value={bookingFilters.date_from ?? ""}
                onChange={(e) =>
                  setBookingFilter("date_from", e.target.value || undefined)
                }
              />
              <Input
                type="date"
                placeholder="To date"
                value={bookingFilters.date_to ?? ""}
                onChange={(e) =>
                  setBookingFilter("date_to", e.target.value || undefined)
                }
              />

              <Select
                value={bookingFilters.status ?? "all"}
                onValueChange={(v) =>
                  setBookingFilter("status", v === "all" ? undefined : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="pending_payment">
                    Pending Payment
                  </SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                  <SelectItem value="no_show">No Show</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={bookingFilters.payment_type ?? "all"}
                onValueChange={(v) =>
                  setBookingFilter("payment_type", v === "all" ? undefined : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Payment Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payment Types</SelectItem>
                  <SelectItem value="single_payment">Single</SelectItem>
                  <SelectItem value="package_redemption">Package</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Export CSV
              </Button>
            </div>
          </div>

          {/* Bookings Table */}
          <div className="rounded-2xl border bg-background overflow-hidden hover:shadow-md transition">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[36px]">
                    <Checkbox
                      checked={allBookingsSelected}
                      onCheckedChange={(c) =>
                        toggleSelectAllBookings(c === true)
                      }
                      aria-label="Select all visible"
                    />
                  </TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Children</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Booked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBookings.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No bookings found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBookings.map((b) => {
                    const selected = selectedBookingIds.has(b.id);
                    return (
                      <TableRow
                        key={b.id}
                        data-state={selected ? "selected" : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleBooking(b.id)}
                            aria-label={`Select booking ${b.parent_name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {b.parent_name}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {b.children.map((c, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-xs"
                              >
                                {c.child_name}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{b.session_title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(b.session_date)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              b.payment_type === "package_redemption"
                                ? "border-purple-200 text-purple-700 bg-purple-50 text-xs"
                                : "border-blue-200 text-blue-700 bg-blue-50 text-xs"
                            }
                          >
                            {b.payment_type === "package_redemption"
                              ? "Package"
                              : "Single"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCents(b.total_cents)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(b.status)}
                          >
                            {statusLabel(b.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(b.booked_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ============================================================ */}
        {/* Packages Tab */}
        {/* ============================================================ */}
        <TabsContent value="packages" className="space-y-4">
          {packagesLowFilter && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Filtered:</span>
              <JumpChip
                icon={Package}
                label="Packages with ≤2 sessions remaining"
                onClear={() => clearJumpFilter("low")}
              />
            </div>
          )}

          {packageData && (
            <>
              {/* Package Summary Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SummaryCard
                  label="Package Revenue"
                  icon={DollarSign}
                  value={
                    <AnimatedCurrency cents={packageData.totalPackageRevenue} />
                  }
                />
                <SummaryCard
                  label="Total Balances"
                  icon={Package}
                  value={<AnimatedMetric value={packageData.balances.length} />}
                />
                <SummaryCard
                  label="Most Popular"
                  icon={Trophy}
                  value={packageData.mostPopularPackage ?? "N/A"}
                  smaller
                />
              </div>

              {/* Package Balances Table */}
              <div className="rounded-2xl border bg-background overflow-hidden hover:shadow-md transition">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parent</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead className="text-center">
                        Remaining / Total
                      </TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBalances.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-8 text-muted-foreground"
                        >
                          No package balances found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredBalances.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">
                            {b.parent_name}
                          </TableCell>
                          <TableCell>{b.package_name}</TableCell>
                          <TableCell className="text-center">
                            <span className="font-semibold">
                              {b.remaining_sessions}
                            </span>
                            <span className="text-muted-foreground">
                              {" "}
                              / {b.total_sessions}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(b.expires_at)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={statusBadgeClass(b.status)}
                            >
                              {statusLabel(b.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ============================================================ */}
        {/* Revenue Tab */}
        {/* ============================================================ */}
        <TabsContent value="revenue" className="space-y-4">
          {revenueData && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SummaryCard
                  label="Total Parent Revenue"
                  icon={TrendingUp}
                  value={<AnimatedCurrency cents={revenueData.totalRevenue} />}
                />
                <SummaryCard
                  label="Single Bookings"
                  icon={DollarSign}
                  value={
                    <AnimatedCurrency
                      cents={revenueData.singleBookingRevenue}
                    />
                  }
                />
                <SummaryCard
                  label="Package Purchases"
                  icon={Package}
                  value={
                    <AnimatedCurrency
                      cents={revenueData.packagePurchaseRevenue}
                    />
                  }
                />
              </div>

              <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="size-5 text-muted-foreground" />
                    <h3 className="text-lg font-semibold text-foreground">
                      Revenue Breakdown
                    </h3>
                  </div>
                  <div className="flex gap-1">
                    {(["session_type", "suburb", "sport"] as const).map((v) => (
                      <Button
                        key={v}
                        variant={
                          revenueChartView === v ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setRevenueChartView(v)}
                        className={
                          revenueChartView === v
                            ? "bg-primary text-white hover:bg-primary/90"
                            : ""
                        }
                      >
                        {v === "session_type"
                          ? "By Type"
                          : v === "suburb"
                            ? "By Suburb"
                            : "By Sport"}
                      </Button>
                    ))}
                  </div>
                </div>

                {getChartData().length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={getChartData()}>
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `$${v}`}
                      />
                      <Tooltip
                        formatter={(value) => [
                          `$${Number(value).toFixed(2)}`,
                          "Revenue",
                        ]}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #E8712A20",
                        }}
                      />
                      <Bar
                        dataKey="revenue"
                        fill="#E8712A"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    No revenue data to display.
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Sticky bulk-action bar — sessions */}
      {activeTab === "sessions" && selectedSessionIds.size > 0 && (
        <SessionsBulkBar
          selectedIds={Array.from(selectedSessionIds)}
          onClear={() => setSelectedSessionIds(new Set())}
          onDone={() => {
            setSelectedSessionIds(new Set());
            void loadSessions();
            void refreshPulse();
          }}
        />
      )}

      {/* Sticky bulk-action bar — bookings */}
      {activeTab === "bookings" && selectedBookingIds.size > 0 && (
        <BookingsBulkBar
          selectedIds={Array.from(selectedBookingIds)}
          onClear={() => setSelectedBookingIds(new Set())}
          onDone={() => {
            setSelectedBookingIds(new Set());
            void loadBookings();
            void refreshPulse();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function SummaryCard({
  label,
  icon: Icon,
  value,
  smaller,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: React.ReactNode;
  smaller?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p
        className={
          smaller
            ? "mt-2 text-lg font-semibold text-foreground"
            : "mt-2 text-3xl font-semibold tabular-nums text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}

function JumpChip({
  icon: Icon,
  label,
  onClear,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
      <Icon className="size-3" />
      {label}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
        aria-label="Clear filter"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

// ============================================================
// Sessions bulk-action bar
// ============================================================

function SessionsBulkBar({
  selectedIds,
  onClear,
  onDone,
}: {
  selectedIds: string[];
  onClear: () => void;
  onDone: () => void;
}) {
  const count = selectedIds.length;
  const [working, setWorking] = useState<"activate" | "publish" | null>(null);

  async function handleActivate() {
    setWorking("activate");
    try {
      const { updated, error } = await bulkActivateSessions(selectedIds);
      if (error && updated === 0) {
        toast.error(error);
        return;
      }
      toast.success(
        `Activated ${updated} session${updated === 1 ? "" : "s"}.`
      );
      onDone();
    } finally {
      setWorking(null);
    }
  }

  async function handlePublish() {
    setWorking("publish");
    try {
      const { updated, error } = await bulkPublishSessions(selectedIds);
      if (error && updated === 0) {
        toast.error(error);
        return;
      }
      toast.success(
        `Published ${updated} session${updated === 1 ? "" : "s"}.`
      );
      onDone();
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-background px-4 py-3 shadow-lg ring-1 ring-primary/20 sm:bottom-6 sm:right-6">
      <div className="flex items-center gap-3 pr-2 text-sm">
        <span className="font-medium text-foreground">
          {count} session{count === 1 ? "" : "s"} selected
        </span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePublish}
        disabled={working !== null}
      >
        <Megaphone className="size-4" />
        {working === "publish" ? "Publishing…" : "Publish"}
      </Button>
      <Button
        size="sm"
        onClick={handleActivate}
        disabled={working !== null}
        className="bg-primary text-white hover:bg-primary/90"
      >
        <CircleCheck className="size-4" />
        {working === "activate" ? "Activating…" : "Activate"}
      </Button>
    </div>
  );
}

// ============================================================
// Bookings bulk-action bar
// ============================================================

function BookingsBulkBar({
  selectedIds,
  onClear,
  onDone,
}: {
  selectedIds: string[];
  onClear: () => void;
  onDone: () => void;
}) {
  const count = selectedIds.length;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);

  async function handleCancel() {
    setWorking(true);
    try {
      const { updated, error } = await bulkCancelBookings(selectedIds, reason);
      if (error && updated === 0) {
        toast.error(error);
        return;
      }
      toast.success(
        `Cancelled ${updated} booking${updated === 1 ? "" : "s"}.`
      );
      setReason("");
      setCancelOpen(false);
      onDone();
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-background px-4 py-3 shadow-lg ring-1 ring-primary/20 sm:bottom-6 sm:right-6">
        <div className="flex items-center gap-3 pr-2 text-sm">
          <span className="font-medium text-foreground">
            {count} booking{count === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={onClear}
          >
            Clear
          </button>
        </div>
        <Button
          size="sm"
          onClick={() => setCancelOpen(true)}
          className="bg-primary text-white hover:bg-primary/90"
        >
          <CircleSlash className="size-4" />
          Cancel bookings
        </Button>
      </div>

      <Sheet open={cancelOpen} onOpenChange={setCancelOpen}>
        <SheetContent className="flex w-full max-w-md flex-col">
          <SheetHeader>
            <SheetTitle>Cancel {count} booking{count === 1 ? "" : "s"}</SheetTitle>
            <SheetDescription>
              Only confirmed or pending-payment bookings will be flipped to
              cancelled. The reason is recorded in the activity log.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 px-4">
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Session cancelled due to weather…"
                rows={5}
              />
            </div>
          </div>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={working}
            >
              Keep bookings
            </Button>
            <Button
              onClick={handleCancel}
              disabled={working}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {working ? "Cancelling…" : "Cancel bookings"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
