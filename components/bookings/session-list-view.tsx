"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Search, Calendar, MapPin, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BookableSession } from "@/lib/types/database";
import type {
  BookableSessionType,
  BookableSessionStatus,
} from "@/lib/types/enums";
import { SPORTS } from "@/lib/types/enums";

interface SessionListViewProps {
  initialData: BookableSession[];
  basePath: string;
}

const SESSION_TYPE_LABELS: Record<BookableSessionType, string> = {
  holiday_clinic: "Holiday Clinic",
  after_school: "After School",
  weekend: "Weekend",
  specialist: "Specialist",
  other: "Other",
};

const STATUS_BADGE_VARIANT: Record<
  BookableSessionStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  open: "default",
  draft: "secondary",
  closed: "outline",
  cancelled: "destructive",
  completed: "secondary",
};

const STATUS_LABELS: Record<BookableSessionStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
  completed: "Completed",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatSessionType(type: BookableSessionType): string {
  return SESSION_TYPE_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function capacityColour(current: number, max: number): string {
  const ratio = current / max;
  if (ratio >= 1) return "text-red-600";
  if (ratio >= 0.75) return "text-amber-600";
  return "text-green-600";
}

export function SessionListView({ initialData, basePath }: SessionListViewProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<BookableSessionType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<BookableSessionStatus | "all">("all");
  const [sportFilter, setSportFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return initialData.filter((session) => {
      if (typeFilter !== "all" && session.session_type !== typeFilter) return false;
      if (statusFilter !== "all" && session.status !== statusFilter) return false;
      if (sportFilter !== "all" && session.sport !== sportFilter) return false;

      if (search) {
        const q = search.toLowerCase();
        const matchesTitle = session.title.toLowerCase().includes(q);
        const matchesLocation = session.location_name?.toLowerCase().includes(q);
        const matchesSuburb = session.suburb.toLowerCase().includes(q);
        if (!matchesTitle && !matchesLocation && !matchesSuburb) return false;
      }

      return true;
    });
  }, [initialData, search, typeFilter, statusFilter, sportFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Bookable Sessions</h1>
          <p className="text-sm text-[#666666]">
            {filtered.length} session{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button render={<Link href={`${basePath}/new`} />}>
          <Plus className="size-4" data-icon="inline-start" />
          Create Session
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, location, suburb..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter((v ?? "all") as BookableSessionType | "all")}
        >
          <SelectTrigger className="w-[160px]">
            <Calendar className="size-4 text-muted-foreground" data-icon="inline-start" />
            <SelectValue placeholder="Session Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="holiday_clinic">Holiday Clinic</SelectItem>
            <SelectItem value="after_school">After School</SelectItem>
            <SelectItem value="weekend">Weekend</SelectItem>
            <SelectItem value="specialist">Specialist</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter((v ?? "all") as BookableSessionStatus | "all")}
        >
          <SelectTrigger className="w-[140px]">
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
          value={sportFilter}
          onValueChange={(v) => setSportFilter((v ?? "all") as string)}
        >
          <SelectTrigger className="w-[150px]">
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
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Calendar className="size-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-[#1A1A1A]">No sessions found</p>
          <p className="mt-1 text-sm text-[#666666]">
            Try adjusting your filters or create a new session.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>
                    <Link
                      href={`${basePath}/${session.id}`}
                      className="font-medium text-[#E8712A] hover:underline"
                    >
                      {session.title}
                    </Link>
                    <p className="text-xs text-[#666666]">
                      {formatSessionType(session.session_type)}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(session.date)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatTime(session.start_time)} – {formatTime(session.end_time)}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3.5 text-muted-foreground" />
                      {session.suburb}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`flex items-center gap-1 font-medium ${capacityColour(session.current_bookings, session.max_capacity)}`}
                    >
                      <Users className="size-3.5" />
                      {session.current_bookings} / {session.max_capacity}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[session.status]}>
                      {STATUS_LABELS[session.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPrice(session.price_cents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
