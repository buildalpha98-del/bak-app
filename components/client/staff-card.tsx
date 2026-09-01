"use client";

import { ShieldCheck, Shield, Heart, HeartPulse } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { VerifiedCoach } from "@/lib/client/staff-actions";

interface StaffCardProps {
  coach: VerifiedCoach;
}

function formatDateDMY(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const SPORT_COLOURS: Record<string, string> = {
  Soccer: "bg-green-100 text-green-800",
  Basketball: "bg-orange-100 text-orange-800",
  Athletics: "bg-yellow-100 text-yellow-800",
  Yoga: "bg-purple-100 text-purple-800",
  Pilates: "bg-pink-100 text-pink-800",
  "Boot Camp": "bg-red-100 text-red-800",
  Swimming: "bg-blue-100 text-blue-800",
  Pickleball: "bg-lime-100 text-lime-800",
  Golf: "bg-emerald-100 text-emerald-800",
  Hockey: "bg-teal-100 text-teal-800",
  Lacrosse: "bg-cyan-100 text-cyan-800",
  "Motor Skills": "bg-violet-100 text-violet-800",
  "Multi-Sport": "bg-indigo-100 text-indigo-800",
  Cricket: "bg-amber-100 text-amber-800",
  Netball: "bg-rose-100 text-rose-800",
  Tennis: "bg-sky-100 text-sky-800",
  Volleyball: "bg-fuchsia-100 text-fuchsia-800",
  Dance: "bg-pink-100 text-pink-800",
  Gymnastics: "bg-purple-100 text-purple-800",
};

function SportBadge({ sport }: { sport: string }) {
  const colours = SPORT_COLOURS[sport] ?? "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colours}`}
    >
      {sport}
    </span>
  );
}

export function StaffCard({ coach }: StaffCardProps) {
  return (
    <Card className="rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-5 space-y-4">
        {/* Header: photo + name + DOB */}
        <div className="flex items-center gap-4">
          {coach.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coach.photo_url}
              alt={coach.name}
              className="h-16 w-16 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-portal-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-lg font-bold">
                {getInitials(coach.name)}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900 truncate">{coach.name}</p>
            {coach.date_of_birth && (
              <p className="text-sm text-gray-500 mt-0.5">
                DOB: {formatDateDMY(coach.date_of_birth)}
              </p>
            )}
          </div>
        </div>

        {/* Sports */}
        {coach.sports.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {coach.sports.map((sport) => (
              <SportBadge key={sport} sport={sport} />
            ))}
          </div>
        )}

        {/* WWCC */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            {coach.wwcc?.status === "verified" ? (
              <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : coach.wwcc?.status === "expired" ? (
              <Shield className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            ) : (
              <Shield className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700">Working With Children Check</p>
              {coach.wwcc === null ? (
                <p className="text-sm text-gray-400">Not on file</p>
              ) : coach.wwcc.status === "verified" ? (
                <div className="space-y-0.5">
                  <p className="text-sm text-green-700 font-medium">Verified</p>
                  {coach.wwcc.expiry_date && (
                    <p className="text-xs text-gray-500">
                      Expires {formatDateDMY(coach.wwcc.expiry_date)}
                    </p>
                  )}
                  {coach.wwcc.document_number && (
                    <p className="text-xs text-gray-500 font-mono">
                      {coach.wwcc.document_number}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-red-600 font-medium">Expired</p>
              )}
            </div>
          </div>

          {/* First Aid */}
          <div className="flex items-start gap-2">
            {coach.firstAid?.status === "verified" ? (
              <HeartPulse className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : coach.firstAid?.status === "expired" ? (
              <Heart className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            ) : (
              <Heart className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700">First Aid</p>
              {coach.firstAid === null ? (
                <p className="text-sm text-gray-400">Not on file</p>
              ) : coach.firstAid.status === "verified" ? (
                <div className="space-y-0.5">
                  <p className="text-sm text-green-700 font-medium">Current</p>
                  {coach.firstAid.expiry_date && (
                    <p className="text-xs text-gray-500">
                      Expires {formatDateDMY(coach.firstAid.expiry_date)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-red-600 font-medium">Expired</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t pt-3 text-xs text-gray-500 space-y-0.5">
          <p>{coach.sessionsAtCentre} session{coach.sessionsAtCentre !== 1 ? "s" : ""} at your centre</p>
          {coach.lastSessionDate && (
            <p>Last: {formatDateDMY(coach.lastSessionDate)}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
