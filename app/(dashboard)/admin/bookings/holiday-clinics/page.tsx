"use client";

import { useState, useEffect } from "react";
import {
  getBookableSessions,
  bulkCreateBookableSessions,
} from "@/lib/bookings/actions";
import type { BookableSession } from "@/lib/types/database";
import type { BookableSessionType } from "@/lib/types/enums";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Plus,
  Loader2,
  Copy,
  Calendar,
  MapPin,
  Users,
  DollarSign,
  X,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface HolidayClinicPeriod {
  name: string;
  startDate: string;
  endDate: string;
  sessions: BookableSession[];
  totalBookings: number;
  totalRevenue: number;
  avgCapacity: number;
}

interface CreatePeriodForm {
  name: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  title: string;
  description: string;
  location_name: string;
  location_address: string;
  suburbs: string;
  sport: string;
  age_group_min: string;
  age_group_max: string;
  max_capacity: string;
  price_dollars: string;
  exclude_weekends: boolean;
}

interface DuplicateForm {
  periodName: string;
  new_start_date: string;
  new_end_date: string;
}

const EMPTY_FORM: CreatePeriodForm = {
  name: "",
  start_date: "",
  end_date: "",
  start_time: "09:00",
  end_time: "15:00",
  title: "",
  description: "",
  location_name: "",
  location_address: "",
  suburbs: "",
  sport: "",
  age_group_min: "",
  age_group_max: "",
  max_capacity: "20",
  price_dollars: "10.00",
  exclude_weekends: true,
};

const SPORTS = [
  "Soccer",
  "Basketball",
  "Athletics",
  "Multi-Sport",
  "Cricket",
  "Netball",
  "Tennis",
  "Dance",
  "Gymnastics",
  "Swimming",
  "Hockey",
  "Volleyball",
  "Golf",
  "Lacrosse",
  "Motor Skills",
];

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

function groupSessionsIntoPeriods(
  sessions: BookableSession[]
): HolidayClinicPeriod[] {
  // Group sessions by proximity (sessions within 14 days of each other = same period)
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const periods: HolidayClinicPeriod[] = [];
  let currentGroup: BookableSession[] = [];

  sorted.forEach((session, idx) => {
    if (currentGroup.length === 0) {
      currentGroup.push(session);
      return;
    }

    const lastDate = new Date(currentGroup[currentGroup.length - 1].date);
    const thisDate = new Date(session.date);
    const daysDiff =
      (thisDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff <= 14) {
      currentGroup.push(session);
    } else {
      // Finalise current group
      periods.push(buildPeriod(currentGroup));
      currentGroup = [session];
    }

    if (idx === sorted.length - 1 && currentGroup.length > 0) {
      periods.push(buildPeriod(currentGroup));
    }
  });

  // Handle single group
  if (periods.length === 0 && currentGroup.length > 0) {
    periods.push(buildPeriod(currentGroup));
  }

  return periods;
}

function buildPeriod(sessions: BookableSession[]): HolidayClinicPeriod {
  const dates = sessions.map((s) => s.date).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const totalBookings = sessions.reduce(
    (sum, s) => sum + s.current_bookings,
    0
  );
  const totalCapacity = sessions.reduce((sum, s) => sum + s.max_capacity, 0);
  const avgCapacity =
    totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0;

  // Estimate revenue from price * bookings
  const totalRevenue = sessions.reduce(
    (sum, s) => sum + s.price_cents * s.current_bookings,
    0
  );

  // Generate a name from the date range
  const startMonth = new Date(startDate).toLocaleDateString("en-AU", {
    month: "short",
  });
  const endMonth = new Date(endDate).toLocaleDateString("en-AU", {
    month: "short",
  });
  const year = new Date(startDate).getFullYear();
  const name =
    startMonth === endMonth
      ? `${startMonth} ${year} Holiday Clinic`
      : `${startMonth}-${endMonth} ${year} Holiday Clinic`;

  return {
    name,
    startDate,
    endDate,
    sessions,
    totalBookings,
    totalRevenue,
    avgCapacity,
  };
}

// ============================================================
// Main Component
// ============================================================

export default function HolidayClinicPage() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<BookableSession[]>([]);
  const [periods, setPeriods] = useState<HolidayClinicPeriod[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<CreatePeriodForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Duplicate state
  const [duplicateForm, setDuplicateForm] = useState<DuplicateForm | null>(
    null
  );
  const [duplicating, setDuplicating] = useState(false);

  // Expanded period
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);

  async function loadSessions() {
    setLoading(true);
    const { data, error: err } = await getBookableSessions({
      session_type: "holiday_clinic" as BookableSessionType,
    });
    if (data) {
      setSessions(data);
      setPeriods(groupSessionsIntoPeriods(data));
    }
    if (err) setError(err);
    setLoading(false);
  }

  useEffect(() => {
    loadSessions();
  }, []);

  async function handleCreatePeriod(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Period name is required.");
      return;
    }
    if (!form.start_date || !form.end_date) {
      setError("Start and end dates are required.");
      return;
    }
    if (!form.title.trim()) {
      setError("Session title is required.");
      return;
    }
    if (!form.location_address.trim()) {
      setError("Location address is required.");
      return;
    }

    const suburbs = form.suburbs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (suburbs.length === 0) {
      setError("At least one suburb is required.");
      return;
    }

    setCreating(true);

    // Create sessions for each suburb
    let totalCreated = 0;
    for (const suburb of suburbs) {
      const { data, error: err } = await bulkCreateBookableSessions({
        start_date: form.start_date,
        end_date: form.end_date,
        start_time: form.start_time,
        end_time: form.end_time,
        title: form.title,
        description: form.description || null,
        session_type: "holiday_clinic" as BookableSessionType,
        location_name: form.location_name || null,
        location_address: form.location_address,
        suburb,
        sport: form.sport || null,
        age_group_min: form.age_group_min
          ? parseInt(form.age_group_min, 10)
          : null,
        age_group_max: form.age_group_max
          ? parseInt(form.age_group_max, 10)
          : null,
        max_capacity: parseInt(form.max_capacity, 10) || 20,
        price_cents: Math.round(
          parseFloat(form.price_dollars || "0") * 100
        ),
        exclude_weekends: form.exclude_weekends,
        status: "draft",
      });

      if (err) {
        setError(err);
        setCreating(false);
        return;
      }
      totalCreated += data.length;
    }

    setSuccess(
      `Created ${totalCreated} sessions across ${suburbs.length} suburb${suburbs.length > 1 ? "s" : ""}.`
    );
    setShowCreateForm(false);
    setForm(EMPTY_FORM);
    setCreating(false);
    await loadSessions();
  }

  async function handleDuplicate(e: React.FormEvent) {
    e.preventDefault();
    if (!duplicateForm) return;

    setError(null);
    setSuccess(null);

    const sourcePeriod = periods.find(
      (p) => p.name === duplicateForm.periodName
    );
    if (!sourcePeriod || sourcePeriod.sessions.length === 0) {
      setError("Source period not found.");
      return;
    }

    if (!duplicateForm.new_start_date || !duplicateForm.new_end_date) {
      setError("New start and end dates are required.");
      return;
    }

    setDuplicating(true);

    // Group source sessions by suburb
    const bySuburb: Record<string, BookableSession[]> = {};
    sourcePeriod.sessions.forEach((s) => {
      if (!bySuburb[s.suburb]) bySuburb[s.suburb] = [];
      bySuburb[s.suburb].push(s);
    });

    let totalCreated = 0;
    for (const [suburb, suburbSessions] of Object.entries(bySuburb)) {
      const templateSession = suburbSessions[0];
      const { data, error: err } = await bulkCreateBookableSessions({
        start_date: duplicateForm.new_start_date,
        end_date: duplicateForm.new_end_date,
        start_time: templateSession.start_time,
        end_time: templateSession.end_time,
        title: templateSession.title,
        description: templateSession.description,
        session_type: templateSession.session_type,
        location_name: templateSession.location_name,
        location_address: templateSession.location_address,
        suburb,
        sport: templateSession.sport,
        age_group_min: templateSession.age_group_min,
        age_group_max: templateSession.age_group_max,
        max_capacity: templateSession.max_capacity,
        price_cents: templateSession.price_cents,
        exclude_weekends: true,
        status: "draft",
      });

      if (err) {
        setError(err);
        setDuplicating(false);
        return;
      }
      totalCreated += data.length;
    }

    setSuccess(`Duplicated period: ${totalCreated} sessions created.`);
    setDuplicateForm(null);
    setDuplicating(false);
    await loadSessions();
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">
            Holiday Clinics
          </h1>
          <p className="text-[#666666] mt-1">
            Create and manage holiday clinic periods and sessions
          </p>
        </div>
        {!showCreateForm && (
          <Button
            className="bg-[#E8712A] hover:bg-[#D4641F] text-white"
            onClick={() => {
              setShowCreateForm(true);
              setError(null);
              setSuccess(null);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Period
          </Button>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">{success}</p>
        </div>
      )}

      {/* Create Period Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreatePeriod}
          className="rounded-xl border border-orange-100 bg-white p-6 space-y-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#1A1A1A]">
              Create Holiday Clinic Period
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowCreateForm(false);
                setForm(EMPTY_FORM);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="period-name">Period Name</Label>
              <Input
                id="period-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. April 2026 Holiday Clinic"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={form.start_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, start_date: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={form.end_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, end_date: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Exclude Weekends</Label>
              <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={form.exclude_weekends}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      exclude_weekends: e.target.checked,
                    }))
                  }
                  className="rounded border-gray-300 text-[#E8712A] focus:ring-[#E8712A]"
                />
                Skip Saturday and Sunday
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="start-time">Start Time</Label>
              <Input
                id="start-time"
                type="time"
                value={form.start_time}
                onChange={(e) =>
                  setForm((f) => ({ ...f, start_time: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-time">End Time</Label>
              <Input
                id="end-time"
                type="time"
                value={form.end_time}
                onChange={(e) =>
                  setForm((f) => ({ ...f, end_time: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="session-title">Session Title</Label>
              <Input
                id="session-title"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g. Multi-Sport Holiday Clinic"
              />
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="session-desc">Description (optional)</Label>
              <Input
                id="session-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Fun-filled day of multi-sport activities"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location-name">Location Name</Label>
              <Input
                id="location-name"
                value={form.location_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location_name: e.target.value }))
                }
                placeholder="e.g. Bankstown Sports Ground"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="location-address">Location Address</Label>
              <Input
                id="location-address"
                value={form.location_address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location_address: e.target.value }))
                }
                placeholder="Full address"
              />
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="suburbs">
                Suburbs (comma-separated for multiple locations)
              </Label>
              <Input
                id="suburbs"
                value={form.suburbs}
                onChange={(e) =>
                  setForm((f) => ({ ...f, suburbs: e.target.value }))
                }
                placeholder="e.g. Bankstown, Liverpool, Greenacre"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sport">Sport</Label>
              <Select
                value={form.sport || "none"}
                onValueChange={(v) => {
                  const val = v === "none" || !v ? "" : v;
                  setForm((f) => ({ ...f, sport: val }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sport" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific sport</SelectItem>
                  {SPORTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="age-min">Min Age</Label>
              <Input
                id="age-min"
                type="number"
                min="0"
                max="18"
                value={form.age_group_min}
                onChange={(e) =>
                  setForm((f) => ({ ...f, age_group_min: e.target.value }))
                }
                placeholder="e.g. 5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="age-max">Max Age</Label>
              <Input
                id="age-max"
                type="number"
                min="0"
                max="18"
                value={form.age_group_max}
                onChange={(e) =>
                  setForm((f) => ({ ...f, age_group_max: e.target.value }))
                }
                placeholder="e.g. 12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Max Capacity</Label>
              <Input
                id="capacity"
                type="number"
                min="1"
                value={form.max_capacity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_capacity: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price per Child ($)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={form.price_dollars}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price_dollars: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              className="bg-[#E8712A] hover:bg-[#D4641F] text-white"
              disabled={creating}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Period
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateForm(false);
                setForm(EMPTY_FORM);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Duplicate Form */}
      {duplicateForm && (
        <form
          onSubmit={handleDuplicate}
          className="rounded-xl border border-blue-100 bg-blue-50/30 p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#1A1A1A]">
              Duplicate Period: {duplicateForm.periodName}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDuplicateForm(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-sm text-[#666666]">
            Sessions will be recreated with the same settings but new dates.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dup-start">New Start Date</Label>
              <Input
                id="dup-start"
                type="date"
                value={duplicateForm.new_start_date}
                onChange={(e) =>
                  setDuplicateForm((f) =>
                    f ? { ...f, new_start_date: e.target.value } : null
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dup-end">New End Date</Label>
              <Input
                id="dup-end"
                type="date"
                value={duplicateForm.new_end_date}
                onChange={(e) =>
                  setDuplicateForm((f) =>
                    f ? { ...f, new_end_date: e.target.value } : null
                  )
                }
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              type="submit"
              className="bg-[#E8712A] hover:bg-[#D4641F] text-white"
              disabled={duplicating}
            >
              {duplicating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              Duplicate
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDuplicateForm(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Periods List */}
      {periods.length === 0 && !showCreateForm ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl bg-white border border-orange-100">
          <Calendar className="h-12 w-12 text-[#E8712A] mb-3 opacity-50" />
          <p className="text-[#666666] text-sm">
            No holiday clinic periods yet. Create your first one above.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {periods.map((period) => {
            const isExpanded = expandedPeriod === period.name;

            return (
              <div
                key={period.name}
                className="rounded-xl border border-orange-100 bg-white overflow-hidden"
              >
                {/* Period Header */}
                <div
                  className="p-5 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onClick={() =>
                    setExpandedPeriod(isExpanded ? null : period.name)
                  }
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[#1A1A1A]">
                        {period.name}
                      </h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-[#666666]">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(period.startDate)} -{" "}
                          {formatDate(period.endDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {period.sessions.length} sessions
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-[#666666]">
                          <Users className="h-3.5 w-3.5" />
                          <span>{period.totalBookings} bookings</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm font-medium text-[#1A1A1A]">
                          <DollarSign className="h-3.5 w-3.5" />
                          <span>{formatCents(period.totalRevenue)}</span>
                        </div>
                      </div>

                      <div className="text-right min-w-[80px]">
                        <p className="text-xs text-[#666666] mb-1">
                          Capacity
                        </p>
                        <Progress value={period.avgCapacity} className="h-2" />
                        <p className="text-xs text-[#666666] mt-0.5">
                          {period.avgCapacity}%
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDuplicateForm({
                            periodName: period.name,
                            new_start_date: "",
                            new_end_date: "",
                          });
                        }}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        Duplicate
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Expanded Session List */}
                {isExpanded && (
                  <div className="border-t border-orange-100">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Suburb</TableHead>
                          <TableHead>Sport</TableHead>
                          <TableHead className="text-center">
                            Capacity
                          </TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-center">
                            Status
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {period.sessions.map((s) => {
                          const capPct =
                            s.max_capacity > 0
                              ? Math.round(
                                  (s.current_bookings / s.max_capacity) * 100
                                )
                              : 0;

                          return (
                            <TableRow key={s.id}>
                              <TableCell className="font-medium">
                                {s.title}
                              </TableCell>
                              <TableCell>{formatDate(s.date)}</TableCell>
                              <TableCell className="text-sm text-[#666666]">
                                {s.start_time} - {s.end_time}
                              </TableCell>
                              <TableCell>{s.suburb}</TableCell>
                              <TableCell>{s.sport ?? "-"}</TableCell>
                              <TableCell className="text-center">
                                <span className="text-sm">
                                  {s.current_bookings}/{s.max_capacity}
                                </span>
                                <span className="text-xs text-[#666666] ml-1">
                                  ({capPct}%)
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCents(s.price_cents)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant="outline"
                                  className={
                                    s.status === "open"
                                      ? "border-green-200 text-green-700 bg-green-50"
                                      : s.status === "draft"
                                        ? "border-amber-200 text-amber-700 bg-amber-50"
                                        : s.status === "closed"
                                          ? "border-red-200 text-red-700 bg-red-50"
                                          : "border-gray-200 text-gray-600 bg-gray-50"
                                  }
                                >
                                  {s.status.charAt(0).toUpperCase() +
                                    s.status.slice(1)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
