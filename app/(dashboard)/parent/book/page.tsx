"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getOpenBookableSessions } from "@/lib/bookings/actions";
import { getParentChildren } from "@/lib/parent/actions";
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
import { SPORTS } from "@/lib/types/enums";
import type { BookableSession } from "@/lib/types/database";
import type { Child } from "@/lib/types/database";
import { Loader2, Calendar, Clock, MapPin, Users, Search } from "lucide-react";
import Link from "next/link";

export default function ParentBookPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<BookableSession[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [suburbSearch, setSuburbSearch] = useState("");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [sessionTypeFilter, setSessionTypeFilter] = useState<string>("all");
  const [ageSuitability, setAgeSuitability] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [sessionsResult, childrenResult] = await Promise.all([
          getOpenBookableSessions(),
          getParentChildren(),
        ]);
        if (sessionsResult.data) setSessions(sessionsResult.data);
        if (childrenResult.data) setChildren(childrenResult.data.map((pc) => pc.child));
      } catch (error) {
        console.error("Failed to load sessions:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const childAges = useMemo(() => {
    return children.map((child) => {
      if (!child.date_of_birth) return null;
      const dob = new Date(child.date_of_birth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      return age;
    });
  }, [children]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      // Suburb filter
      if (
        suburbSearch &&
        !session.suburb?.toLowerCase().includes(suburbSearch.toLowerCase()) &&
        !session.location_name?.toLowerCase().includes(suburbSearch.toLowerCase())
      ) {
        return false;
      }

      // Sport filter
      if (sportFilter !== "all" && session.sport !== sportFilter) {
        return false;
      }

      // Session type filter
      if (sessionTypeFilter !== "all" && session.session_type !== sessionTypeFilter) {
        return false;
      }

      // Age suitability filter
      if (ageSuitability && childAges.length > 0) {
        const validAges = childAges.filter((a): a is number => a !== null);
        if (validAges.length > 0) {
          const hasMatchingChild = validAges.some(
            (age) =>
              age >= (session.age_group_min ?? 0) &&
              age <= (session.age_group_max ?? 99)
          );
          if (!hasMatchingChild) return false;
        }
      }

      return true;
    });
  }, [sessions, suburbSearch, sportFilter, sessionTypeFilter, ageSuitability, childAges]);

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function formatTime(time: string) {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours, 10);
    const suffix = h >= 12 ? "pm" : "am";
    const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${display}:${minutes}${suffix}`;
  }

  function formatPrice(cents: number) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#E8712A]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Book a Session</h1>
        <p className="text-muted-foreground mt-1">
          Browse and book sessions for your kids
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by suburb or location..."
            value={suburbSearch}
            onChange={(e) => setSuburbSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={sportFilter}
          onValueChange={(v) => setSportFilter(v ?? "all")}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Sports" />
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
          value={sessionTypeFilter}
          onValueChange={(v) => setSessionTypeFilter(v ?? "all")}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="All Types" />
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

        <Button
          variant={ageSuitability ? "default" : "outline"}
          size="sm"
          onClick={() => setAgeSuitability(!ageSuitability)}
          className={ageSuitability ? "bg-[#E8712A] hover:bg-[#d4651f]" : ""}
        >
          Age Suitable
        </Button>
      </div>

      {/* Sessions grid */}
      {filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl bg-white border border-orange-100">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-[#E8712A] mb-4">
            <Calendar className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            No sessions available
          </h2>
          <p className="text-sm text-muted-foreground mt-1 text-center max-w-sm">
            There are no sessions matching your filters right now. Try adjusting
            your search or check back later.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSessions.map((session) => {
            const isFull =
              (session.current_bookings ?? 0) >= (session.max_capacity ?? 0);
            const spotsRemaining =
              (session.max_capacity ?? 0) - (session.current_bookings ?? 0);

            return (
              <div
                key={session.id}
                className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-foreground text-base leading-tight">
                    {session.title}
                  </h3>
                  <Badge
                    variant="secondary"
                    className="ml-2 shrink-0 bg-orange-50 text-[#E8712A] border-orange-200"
                  >
                    {session.sport}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>{formatDate(session.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>
                      {formatTime(session.start_time)} &ndash;{" "}
                      {formatTime(session.end_time)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>
                      {session.location_name}
                      {session.suburb ? `, ${session.suburb}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0" />
                    <span>
                      Ages {session.age_group_min}&ndash;{session.age_group_max}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-3 border-t">
                  <div>
                    <span className="text-lg font-bold text-foreground">
                      {formatPrice(session.price_cents)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      / child
                    </span>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-xs font-medium ${
                        isFull
                          ? "text-red-600"
                          : spotsRemaining <= 3
                            ? "text-amber-600"
                            : "text-muted-foreground"
                      }`}
                    >
                      {isFull
                        ? "Session full"
                        : `${spotsRemaining} spot${spotsRemaining !== 1 ? "s" : ""} left`}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  {isFull ? (
                    <Button
                      variant="outline"
                      className="w-full border-[#E8712A] text-[#E8712A] hover:bg-orange-50"
                      render={
                        <Link href={`/parent/book/${session.id}`} />
                      }
                    >
                      Join Waitlist
                    </Button>
                  ) : (
                    <Button
                      className="w-full bg-[#E8712A] hover:bg-[#d4651f]"
                      render={
                        <Link href={`/parent/book/${session.id}`} />
                      }
                    >
                      Book Now
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
