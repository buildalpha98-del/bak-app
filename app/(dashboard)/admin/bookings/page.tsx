"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getAdminBookingSummary,
  getAdminBookingsList,
  getAdminSessionsList,
  getAdminPackageBalances,
  getAdminRevenueBreakdown,
  exportBookingsCSV,
  toggleSessionStatus,
  getSessionsForDropdown,
} from "@/lib/bookings/admin-booking-actions";
import type {
  AdminBookingSummary,
  AdminBookingRow,
  AdminSessionRow,
  AdminPackageSummary,
  AdminRevenueBreakdown,
  AdminBookingFilters,
} from "@/lib/bookings/admin-booking-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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

// ============================================================
// Main Component
// ============================================================

export default function AdminBookingsDashboard() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("sessions");

  // Summary
  const [summary, setSummary] = useState<AdminBookingSummary | null>(null);

  // Sessions
  const [sessions, setSessions] = useState<AdminSessionRow[]>([]);
  const [togglingSession, setTogglingSession] = useState<string | null>(null);

  // Bookings
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [bookingFilters, setBookingFilters] = useState<AdminBookingFilters>({});
  const [sessionOptions, setSessionOptions] = useState<
    { id: string; title: string; date: string }[]
  >([]);
  const [exporting, setExporting] = useState(false);

  // Packages
  const [packageData, setPackageData] = useState<AdminPackageSummary | null>(null);

  // Revenue
  const [revenueData, setRevenueData] = useState<AdminRevenueBreakdown | null>(null);
  const [revenueChartView, setRevenueChartView] = useState<
    "session_type" | "suburb" | "sport"
  >("session_type");

  const [error, setError] = useState<string | null>(null);

  // Load summary on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error: err } = await getAdminBookingSummary();
      if (data) setSummary(data);
      if (err) setError(err);
      setLoading(false);
    }
    load();
  }, []);

  // Load tab data
  useEffect(() => {
    async function loadTab() {
      setError(null);
      if (activeTab === "sessions") {
        const { data, error: err } = await getAdminSessionsList();
        if (data) setSessions(data);
        if (err) setError(err);
      } else if (activeTab === "bookings") {
        const [bookingsResult, sessionsResult] = await Promise.all([
          getAdminBookingsList(bookingFilters),
          getSessionsForDropdown(),
        ]);
        if (bookingsResult.data) setBookings(bookingsResult.data);
        if (sessionsResult.data) setSessionOptions(sessionsResult.data);
        if (bookingsResult.error) setError(bookingsResult.error);
      } else if (activeTab === "packages") {
        const { data, error: err } = await getAdminPackageBalances();
        if (data) setPackageData(data);
        if (err) setError(err);
      } else if (activeTab === "revenue") {
        const { data, error: err } = await getAdminRevenueBreakdown();
        if (data) setRevenueData(data);
        if (err) setError(err);
      }
    }
    loadTab();
  }, [activeTab]);

  // Reload bookings when filters change
  const loadFilteredBookings = useCallback(async () => {
    const { data, error: err } = await getAdminBookingsList(bookingFilters);
    if (data) setBookings(data);
    if (err) setError(err);
  }, [bookingFilters]);

  useEffect(() => {
    if (activeTab === "bookings") {
      loadFilteredBookings();
    }
  }, [bookingFilters, activeTab, loadFilteredBookings]);

  // Toggle session open/close
  async function handleToggleSession(sessionId: string, currentStatus: string) {
    setTogglingSession(sessionId);
    const { error: err } = await toggleSessionStatus(sessionId, currentStatus);
    if (err) {
      setError(err);
    } else {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, status: s.status === "open" ? "closed" : "open" }
            : s
        )
      );
    }
    setTogglingSession(null);
  }

  // Export CSV
  async function handleExportCSV() {
    setExporting(true);
    const { data: csv, error: err } = await exportBookingsCSV(bookingFilters);
    if (err) {
      setError(err);
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

  // Chart data
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
        <Loader2 className="h-8 w-8 animate-spin text-[#E8712A]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">
            Booking Dashboard
          </h1>
          <p className="text-[#666666] mt-1">
            Manage parent bookings, sessions, packages, and revenue
          </p>
        </div>
        <Link href="/admin/bookings/sessions/new">
          <Button className="bg-[#E8712A] hover:bg-[#D4641F] text-white">
            <CalendarDays className="h-4 w-4 mr-2" />
            Create Session
          </Button>
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-orange-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#666666]">
                Bookings This Week
              </p>
              <CalendarDays className="h-5 w-5 text-[#E8712A]" />
            </div>
            <p className="mt-2 text-3xl font-bold text-[#1A1A1A]">
              {summary.bookingsThisWeek}
            </p>
          </div>

          <div className="rounded-xl border border-orange-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#666666]">
                Revenue This Week
              </p>
              <DollarSign className="h-5 w-5 text-[#E8712A]" />
            </div>
            <p className="mt-2 text-3xl font-bold text-[#1A1A1A]">
              {formatCents(summary.revenueThisWeek)}
            </p>
          </div>

          <div className="rounded-xl border border-orange-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#666666]">
                Sessions With Capacity
              </p>
              <Users className="h-5 w-5 text-[#E8712A]" />
            </div>
            <p className="mt-2 text-3xl font-bold text-[#1A1A1A]">
              {summary.sessionsWithCapacity}
            </p>
          </div>

          <div className="rounded-xl border border-orange-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#666666]">
                Active Waitlist
              </p>
              <Clock className="h-5 w-5 text-[#E8712A]" />
            </div>
            <p className="mt-2 text-3xl font-bold text-[#1A1A1A]">
              {summary.activeWaitlist}
            </p>
          </div>
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

        {/* ============================================ */}
        {/* Sessions Tab */}
        {/* ============================================ */}
        <TabsContent value="sessions" className="space-y-4">
          <div className="rounded-xl border border-orange-100 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
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
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-[#666666]"
                    >
                      No bookable sessions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((s) => {
                    const capacityPct =
                      s.max_capacity > 0
                        ? Math.round(
                            (s.current_bookings / s.max_capacity) * 100
                          )
                        : 0;

                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-[#1A1A1A]">
                              {s.title}
                            </p>
                            <p className="text-xs text-[#666666]">
                              {s.sport && `${s.sport} — `}
                              {s.suburb}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{formatDate(s.date)}</p>
                          <p className="text-xs text-[#666666]">
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
                            <div className="flex justify-between text-xs text-[#666666]">
                              <span>
                                {s.current_bookings}/{s.max_capacity}
                              </span>
                              <span>{capacityPct}%</span>
                            </div>
                            <Progress
                              value={capacityPct}
                              className="h-2"
                            />
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
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : s.status === "open" ? (
                                <ToggleRight className="h-4 w-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-gray-400" />
                              )}
                            </Button>
                            <Link
                              href={`/admin/bookings/sessions/${s.id}`}
                            >
                              <Button variant="ghost" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
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

        {/* ============================================ */}
        {/* Bookings Tab */}
        {/* ============================================ */}
        <TabsContent value="bookings" className="space-y-4">
          {/* Filters */}
          <div className="rounded-xl border border-orange-100 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Select
                value={bookingFilters.session_id ?? "all"}
                onValueChange={(v) => {
                  const val = v === "all" || !v ? undefined : v;
                  setBookingFilters((f) => ({ ...f, session_id: val }));
                }}
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
                  setBookingFilters((f) => ({
                    ...f,
                    date_from: e.target.value || undefined,
                  }))
                }
              />
              <Input
                type="date"
                placeholder="To date"
                value={bookingFilters.date_to ?? ""}
                onChange={(e) =>
                  setBookingFilters((f) => ({
                    ...f,
                    date_to: e.target.value || undefined,
                  }))
                }
              />

              <Select
                value={bookingFilters.status ?? "all"}
                onValueChange={(v) => {
                  const val = v === "all" || !v ? undefined : v;
                  setBookingFilters((f) => ({ ...f, status: val }));
                }}
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
                onValueChange={(v) => {
                  const val = v === "all" || !v ? undefined : v;
                  setBookingFilters((f) => ({ ...f, payment_type: val }));
                }}
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export CSV
              </Button>
            </div>
          </div>

          {/* Bookings Table */}
          <div className="rounded-xl border border-orange-100 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
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
                {bookings.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-[#666666]"
                    >
                      No bookings found.
                    </TableCell>
                  </TableRow>
                ) : (
                  bookings.map((b) => (
                    <TableRow key={b.id}>
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
                        <p className="text-xs text-[#666666]">
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
                      <TableCell className="text-sm text-[#666666]">
                        {formatDate(b.booked_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ============================================ */}
        {/* Packages Tab */}
        {/* ============================================ */}
        <TabsContent value="packages" className="space-y-4">
          {packageData && (
            <>
              {/* Package Summary Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-orange-100 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[#666666]">
                      Package Revenue
                    </p>
                    <DollarSign className="h-5 w-5 text-[#E8712A]" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-[#1A1A1A]">
                    {formatCents(packageData.totalPackageRevenue)}
                  </p>
                </div>

                <div className="rounded-xl border border-orange-100 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[#666666]">
                      Total Balances
                    </p>
                    <Package className="h-5 w-5 text-[#E8712A]" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-[#1A1A1A]">
                    {packageData.balances.length}
                  </p>
                </div>

                <div className="rounded-xl border border-orange-100 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[#666666]">
                      Most Popular
                    </p>
                    <Trophy className="h-5 w-5 text-[#E8712A]" />
                  </div>
                  <p className="mt-2 text-lg font-bold text-[#1A1A1A]">
                    {packageData.mostPopularPackage ?? "N/A"}
                  </p>
                </div>
              </div>

              {/* Package Balances Table */}
              <div className="rounded-xl border border-orange-100 bg-white overflow-hidden">
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
                    {packageData.balances.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-8 text-[#666666]"
                        >
                          No package balances found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      packageData.balances.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">
                            {b.parent_name}
                          </TableCell>
                          <TableCell>{b.package_name}</TableCell>
                          <TableCell className="text-center">
                            <span className="font-semibold">
                              {b.remaining_sessions}
                            </span>
                            <span className="text-[#666666]">
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

        {/* ============================================ */}
        {/* Revenue Tab */}
        {/* ============================================ */}
        <TabsContent value="revenue" className="space-y-4">
          {revenueData && (
            <>
              {/* Revenue Summary Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-orange-100 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[#666666]">
                      Total Parent Revenue
                    </p>
                    <TrendingUp className="h-5 w-5 text-[#E8712A]" />
                  </div>
                  <p className="mt-2 text-3xl font-bold text-[#1A1A1A]">
                    {formatCents(revenueData.totalRevenue)}
                  </p>
                </div>

                <div className="rounded-xl border border-orange-100 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[#666666]">
                      Single Bookings
                    </p>
                    <DollarSign className="h-5 w-5 text-blue-500" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-[#1A1A1A]">
                    {formatCents(revenueData.singleBookingRevenue)}
                  </p>
                </div>

                <div className="rounded-xl border border-orange-100 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[#666666]">
                      Package Purchases
                    </p>
                    <Package className="h-5 w-5 text-purple-500" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-[#1A1A1A]">
                    {formatCents(revenueData.packagePurchaseRevenue)}
                  </p>
                </div>
              </div>

              {/* Chart */}
              <div className="rounded-xl border border-orange-100 bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-[#E8712A]" />
                    <h3 className="text-lg font-semibold text-[#1A1A1A]">
                      Revenue Breakdown
                    </h3>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant={
                        revenueChartView === "session_type"
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      onClick={() => setRevenueChartView("session_type")}
                      className={
                        revenueChartView === "session_type"
                          ? "bg-[#E8712A] hover:bg-[#D4641F] text-white"
                          : ""
                      }
                    >
                      By Type
                    </Button>
                    <Button
                      variant={
                        revenueChartView === "suburb" ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setRevenueChartView("suburb")}
                      className={
                        revenueChartView === "suburb"
                          ? "bg-[#E8712A] hover:bg-[#D4641F] text-white"
                          : ""
                      }
                    >
                      By Suburb
                    </Button>
                    <Button
                      variant={
                        revenueChartView === "sport" ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setRevenueChartView("sport")}
                      className={
                        revenueChartView === "sport"
                          ? "bg-[#E8712A] hover:bg-[#D4641F] text-white"
                          : ""
                      }
                    >
                      By Sport
                    </Button>
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
                  <div className="flex items-center justify-center h-48 text-[#666666] text-sm">
                    No revenue data to display.
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
