"use client";

import { useState, useEffect, type FormEvent } from "react";
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
import { Loader2, Save } from "lucide-react";
import type { BookableSession } from "@/lib/types/database";
import type { BookableSessionInput } from "@/lib/bookings/actions";
import type {
  BookableSessionType,
  BookableSessionStatus,
} from "@/lib/types/enums";
import { SPORTS } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

interface BookableSessionFormProps {
  initialData?: BookableSession | null;
  coaches: { id: string; name: string }[];
  onSubmit: (data: BookableSessionInput) => Promise<{ error: string | null }>;
  isSubmitting?: boolean;
}

// ============================================================
// Constants
// ============================================================

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
  { value: "closed", label: "Closed" },
];

// ============================================================
// Helper — convert datetime-local string to ISO or null
// ============================================================

function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  // Format as YYYY-MM-DDTHH:mm for datetime-local input
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ============================================================
// Component
// ============================================================

export function BookableSessionForm({
  initialData,
  coaches,
  onSubmit,
  isSubmitting: externalSubmitting,
}: BookableSessionFormProps) {
  const isEditing = !!initialData;

  // ----------------------------------------------------------
  // Form state
  // ----------------------------------------------------------
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(
    initialData?.description ?? ""
  );
  const [sessionType, setSessionType] = useState<BookableSessionType>(
    initialData?.session_type ?? "holiday_clinic"
  );
  const [date, setDate] = useState(initialData?.date ?? "");
  const [startTime, setStartTime] = useState(initialData?.start_time ?? "");
  const [endTime, setEndTime] = useState(initialData?.end_time ?? "");
  const [locationName, setLocationName] = useState(
    initialData?.location_name ?? ""
  );
  const [locationAddress, setLocationAddress] = useState(
    initialData?.location_address ?? ""
  );
  const [suburb, setSuburb] = useState(initialData?.suburb ?? "");
  const [sport, setSport] = useState(initialData?.sport ?? "");
  const [ageGroupMin, setAgeGroupMin] = useState(
    initialData?.age_group_min?.toString() ?? ""
  );
  const [ageGroupMax, setAgeGroupMax] = useState(
    initialData?.age_group_max?.toString() ?? ""
  );
  const [maxCapacity, setMaxCapacity] = useState(
    initialData?.max_capacity?.toString() ?? ""
  );
  const [priceDollars, setPriceDollars] = useState(
    initialData ? (initialData.price_cents / 100).toFixed(2) : ""
  );
  const [packageEligible, setPackageEligible] = useState(
    initialData?.package_eligible ?? true
  );
  const [coachId, setCoachId] = useState(initialData?.coach_id ?? "");
  const [status, setStatus] = useState<BookableSessionStatus>(
    initialData?.status ?? "draft"
  );
  const [bookingOpensAt, setBookingOpensAt] = useState(
    isoToDatetimeLocal(initialData?.booking_opens_at ?? null)
  );
  const [bookingClosesAt, setBookingClosesAt] = useState(
    isoToDatetimeLocal(initialData?.booking_closes_at ?? null)
  );

  // Roster link (seam S1): routes booked children onto the coach's
  // attendance list. Optional but strongly encouraged for real events.
  const [rosterSessionId, setRosterSessionId] = useState(
    initialData?.session_id ?? ""
  );
  const [rosterOptions, setRosterOptions] = useState<
    { id: string; label: string }[]
  >([]);
  useEffect(() => {
    import("@/lib/bookings/admin-booking-actions").then(
      ({ getRosterSessionsForLink }) =>
        getRosterSessionsForLink().then(({ data }) => setRosterOptions(data))
    );
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [internalSubmitting, setInternalSubmitting] = useState(false);
  const submitting = externalSubmitting ?? internalSubmitting;

  // ----------------------------------------------------------
  // Submit handler
  // ----------------------------------------------------------
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInternalSubmitting(true);

    const input: BookableSessionInput = {
      session_id: rosterSessionId || null,
      title: title.trim(),
      description: description.trim() || null,
      session_type: sessionType,
      date,
      start_time: startTime,
      end_time: endTime,
      location_name: locationName.trim() || null,
      location_address: locationAddress.trim(),
      suburb: suburb.trim(),
      sport: sport || null,
      age_group_min: ageGroupMin ? Number(ageGroupMin) : null,
      age_group_max: ageGroupMax ? Number(ageGroupMax) : null,
      max_capacity: Number(maxCapacity),
      price_cents: Math.round(parseFloat(priceDollars) * 100),
      package_eligible: packageEligible,
      coach_id: coachId || null,
      status,
      booking_opens_at: datetimeLocalToIso(bookingOpensAt),
      booking_closes_at: datetimeLocalToIso(bookingClosesAt),
    };

    const result = await onSubmit(input);
    if (result.error) {
      setError(result.error);
    }
    setInternalSubmitting(false);
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-orange-100 bg-card p-6"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Title — full width */}
        <div className="sm:col-span-2">
          <Label htmlFor="sf-title">Title *</Label>
          <Input
            id="sf-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Holiday Soccer Clinic — Week 1"
          />
        </div>

        {/* Description — full width */}
        <div className="sm:col-span-2">
          <Label htmlFor="sf-description">Description</Label>
          <textarea
            id="sf-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description visible to parents"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Session Type */}
        <div>
          <Label>Session Type *</Label>
          <Select
            value={sessionType}
            onValueChange={(v) =>
              setSessionType((v ?? "holiday_clinic") as BookableSessionType)
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

        {/* Roster session link — routes booked children onto the
            coach's attendance list */}
        <div className="sm:col-span-2">
          <Label>Roster session</Label>
          <Select
            value={rosterSessionId}
            onValueChange={(v) => setRosterSessionId(v ?? "")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Not linked (booked children won't reach the coach's list)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Not linked</SelectItem>
              {rosterOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Link the roster session this event runs as — booked children then
            appear on the coach&apos;s attendance list automatically.
          </p>
        </div>

        {/* Date */}
        <div>
          <Label htmlFor="sf-date">Date *</Label>
          <Input
            id="sf-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Start Time */}
        <div>
          <Label htmlFor="sf-start">Start Time *</Label>
          <Input
            id="sf-start"
            type="time"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>

        {/* End Time */}
        <div>
          <Label htmlFor="sf-end">End Time *</Label>
          <Input
            id="sf-end"
            type="time"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>

        {/* Location Name */}
        <div>
          <Label htmlFor="sf-loc-name">Location Name</Label>
          <Input
            id="sf-loc-name"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            placeholder="e.g. Bankstown Oval"
          />
        </div>

        {/* Suburb */}
        <div>
          <Label htmlFor="sf-suburb">Suburb *</Label>
          <Input
            id="sf-suburb"
            required
            value={suburb}
            onChange={(e) => setSuburb(e.target.value)}
            placeholder="e.g. Bankstown"
          />
        </div>

        {/* Location Address — full width */}
        <div className="sm:col-span-2">
          <Label htmlFor="sf-loc-addr">Location Address *</Label>
          <Input
            id="sf-loc-addr"
            required
            value={locationAddress}
            onChange={(e) => setLocationAddress(e.target.value)}
            placeholder="e.g. 25 Chapel Rd, Bankstown NSW 2200"
          />
        </div>

        {/* Sport */}
        <div>
          <Label>Sport</Label>
          <Select
            value={sport}
            onValueChange={(v) => setSport(v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select sport" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {SPORTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Age Group — two inputs side by side within one grid cell */}
        <div>
          <Label>Age Group</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={18}
              placeholder="Min"
              value={ageGroupMin}
              onChange={(e) => setAgeGroupMin(e.target.value)}
              className="w-full"
            />
            <span className="shrink-0 text-sm text-muted-foreground">to</span>
            <Input
              type="number"
              min={0}
              max={18}
              placeholder="Max"
              value={ageGroupMax}
              onChange={(e) => setAgeGroupMax(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        {/* Max Capacity */}
        <div>
          <Label htmlFor="sf-capacity">Max Capacity *</Label>
          <Input
            id="sf-capacity"
            type="number"
            required
            min={1}
            value={maxCapacity}
            onChange={(e) => setMaxCapacity(e.target.value)}
            placeholder="e.g. 30"
          />
        </div>

        {/* Price */}
        <div>
          <Label htmlFor="sf-price">Price ($) *</Label>
          <Input
            id="sf-price"
            type="number"
            required
            min={0}
            step={0.01}
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            placeholder="e.g. 10.00"
          />
        </div>

        {/* Coach */}
        <div>
          <Label>Coach</Label>
          <Select
            value={coachId}
            onValueChange={(v) => setCoachId(v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select coach" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Unassigned</SelectItem>
              {coaches.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div>
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
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Booking Opens At */}
        <div>
          <Label htmlFor="sf-opens">Booking Opens At</Label>
          <Input
            id="sf-opens"
            type="datetime-local"
            value={bookingOpensAt}
            onChange={(e) => setBookingOpensAt(e.target.value)}
          />
        </div>

        {/* Booking Closes At */}
        <div>
          <Label htmlFor="sf-closes">Booking Closes At</Label>
          <Input
            id="sf-closes"
            type="datetime-local"
            value={bookingClosesAt}
            onChange={(e) => setBookingClosesAt(e.target.value)}
          />
        </div>

        {/* Package Eligible — checkbox, full width */}
        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            id="sf-pkg"
            type="checkbox"
            checked={packageEligible}
            onChange={(e) => setPackageEligible(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-primary"
          />
          <Label htmlFor="sf-pkg" className="cursor-pointer select-none">
            Eligible for session packages
          </Label>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full"
        style={{ backgroundColor: "#E8712A" }}
      >
        {submitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        {isEditing ? "Update Session" : "Create Session"}
      </Button>
    </form>
  );
}
