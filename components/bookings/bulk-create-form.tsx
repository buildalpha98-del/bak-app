"use client";

import { useState, useMemo, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Loader2, CalendarRange } from "lucide-react";
import type { BookableSession } from "@/lib/types/database";
import type { BulkCreateInput } from "@/lib/bookings/actions";
import type {
  BookableSessionType,
  BookableSessionStatus,
} from "@/lib/types/enums";
import { SPORTS } from "@/lib/types/enums";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

interface BulkCreateFormProps {
  coaches: { id: string; name: string }[];
  onSubmit: (
    data: BulkCreateInput
  ) => Promise<{ data: BookableSession[]; error: string | null }>;
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

const SESSION_TYPES: { value: BookableSessionType; label: string }[] = [
  { value: "holiday_clinic", label: "Holiday Clinic" },
  { value: "after_school", label: "After School" },
  { value: "weekend", label: "Weekend" },
  { value: "specialist", label: "Specialist" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS: { value: BookableSessionStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
];

function countSessionDays(
  startDate: string,
  endDate: string,
  excludeWeekends: boolean
): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (!excludeWeekends || (day !== 0 && day !== 6)) {
      count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function formatDateDisplay(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────

export function BulkCreateForm({ coaches, onSubmit }: BulkCreateFormProps) {
  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sessionType, setSessionType] =
    useState<BookableSessionType>("holiday_clinic");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [excludeWeekends, setExcludeWeekends] = useState(true);
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [sport, setSport] = useState("");
  const [ageGroupMin, setAgeGroupMin] = useState<string>("");
  const [ageGroupMax, setAgeGroupMax] = useState<string>("");
  const [maxCapacity, setMaxCapacity] = useState<string>("");
  const [priceDollars, setPriceDollars] = useState<string>("");
  const [packageEligible, setPackageEligible] = useState(true);
  const [coachId, setCoachId] = useState("");
  const [status, setStatus] = useState<BookableSessionStatus>("draft");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const sessionCount = useMemo(
    () => countSessionDays(startDate, endDate, excludeWeekends),
    [startDate, endDate, excludeWeekends]
  );

  // ──────────────────────────────────────────────────────────────
  // Submit
  // ──────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessCount(null);

    if (sessionCount === 0) {
      setError("Date range produces no sessions. Please adjust the dates.");
      return;
    }

    const priceCents = Math.round(parseFloat(priceDollars) * 100);
    if (isNaN(priceCents) || priceCents <= 0) {
      setError("Please enter a valid price.");
      return;
    }

    const capacity = parseInt(maxCapacity, 10);
    if (isNaN(capacity) || capacity <= 0) {
      setError("Please enter a valid max capacity.");
      return;
    }

    const payload: BulkCreateInput = {
      title: title.trim(),
      description: description.trim() || null,
      session_type: sessionType,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      exclude_weekends: excludeWeekends,
      location_name: locationName.trim() || null,
      location_address: locationAddress.trim(),
      suburb: suburb.trim(),
      sport: sport || null,
      age_group_min: ageGroupMin ? parseInt(ageGroupMin, 10) : null,
      age_group_max: ageGroupMax ? parseInt(ageGroupMax, 10) : null,
      max_capacity: capacity,
      price_cents: priceCents,
      package_eligible: packageEligible,
      coach_id: coachId || null,
      status,
    };

    setSubmitting(true);
    try {
      const result = await onSubmit(payload);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccessCount(result.data.length);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-orange-100 bg-white p-6">
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── Session Details ──────────────────────────────────── */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#666666]">
            Session Details
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bulk-title">Title</Label>
              <Input
                id="bulk-title"
                required
                placeholder="e.g. Summer Soccer Camp"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bulk-description">Description</Label>
              <textarea
                id="bulk-description"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Session Type</Label>
              <Select
                value={sessionType}
                onValueChange={(v) =>
                  setSessionType(
                    (v ?? "holiday_clinic") as BookableSessionType
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Sport</Label>
              <Select
                value={sport}
                onValueChange={(v) => setSport(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select sport (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {SPORTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* ── Date & Time Range ────────────────────────────────── */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#666666]">
            Date &amp; Time Range
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-start-date">Start Date</Label>
              <Input
                id="bulk-start-date"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-end-date">End Date</Label>
              <Input
                id="bulk-end-date"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-start-time">Start Time</Label>
              <Input
                id="bulk-start-time"
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-end-time">End Time</Label>
              <Input
                id="bulk-end-time"
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="bulk-exclude-weekends"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-[#E8712A] focus:ring-[#E8712A]"
                checked={excludeWeekends}
                onChange={(e) => setExcludeWeekends(e.target.checked)}
              />
              <Label htmlFor="bulk-exclude-weekends" className="cursor-pointer">
                Exclude weekends
              </Label>
            </div>
          </div>

          {/* Preview */}
          {startDate && endDate && (
            <div className="flex items-center gap-2 rounded-lg bg-orange-50 px-4 py-3 text-sm text-[#1A1A1A]">
              <CalendarRange className="size-4 shrink-0 text-[#E8712A]" />
              <span>
                This will create{" "}
                <strong className="text-[#E8712A]">{sessionCount}</strong>{" "}
                session{sessionCount !== 1 ? "s" : ""} from{" "}
                {formatDateDisplay(startDate)} to {formatDateDisplay(endDate)}
              </span>
            </div>
          )}
        </section>

        {/* ── Location ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#666666]">
            Location
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-location-name">Location Name</Label>
              <Input
                id="bulk-location-name"
                placeholder="e.g. Bankstown Oval"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-suburb">Suburb</Label>
              <Input
                id="bulk-suburb"
                required
                placeholder="e.g. Bankstown"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bulk-location-address">Location Address</Label>
              <Input
                id="bulk-location-address"
                required
                placeholder="Full street address"
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* ── Capacity & Pricing ───────────────────────────────── */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#666666]">
            Capacity &amp; Pricing
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-age-min">Age Group Min</Label>
              <Input
                id="bulk-age-min"
                type="number"
                min={0}
                max={18}
                placeholder="e.g. 5"
                value={ageGroupMin}
                onChange={(e) => setAgeGroupMin(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-age-max">Age Group Max</Label>
              <Input
                id="bulk-age-max"
                type="number"
                min={0}
                max={18}
                placeholder="e.g. 12"
                value={ageGroupMax}
                onChange={(e) => setAgeGroupMax(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-capacity">Max Capacity</Label>
              <Input
                id="bulk-capacity"
                type="number"
                required
                min={1}
                placeholder="e.g. 30"
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-price">Price ($)</Label>
              <Input
                id="bulk-price"
                type="number"
                required
                min={0}
                step={0.01}
                placeholder="e.g. 25.00"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="bulk-package-eligible"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-[#E8712A] focus:ring-[#E8712A]"
                checked={packageEligible}
                onChange={(e) => setPackageEligible(e.target.checked)}
              />
              <Label
                htmlFor="bulk-package-eligible"
                className="cursor-pointer"
              >
                Package eligible
              </Label>
            </div>
          </div>
        </section>

        {/* ── Assignment ───────────────────────────────────────── */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#666666]">
            Assignment
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Coach</Label>
              <Select
                value={coachId}
                onValueChange={(v) => setCoachId(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select coach (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {coaches.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) =>
                  setStatus((v ?? "draft") as BookableSessionStatus)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* ── Error / Success ──────────────────────────────────── */}
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {successCount !== null && (
          <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
            Successfully created {successCount} session
            {successCount !== 1 ? "s" : ""}.
          </p>
        )}

        {/* ── Submit ───────────────────────────────────────────── */}
        <Button
          type="submit"
          disabled={submitting || sessionCount === 0}
          className="w-full bg-[#E8712A] text-white hover:bg-[#d4641f]"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Creating…
            </>
          ) : (
            `Create ${sessionCount} Session${sessionCount !== 1 ? "s" : ""}`
          )}
        </Button>
      </form>
    </div>
  );
}
