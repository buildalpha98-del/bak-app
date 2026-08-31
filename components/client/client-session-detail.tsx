"use client";

import Link from "@/components/ui/app-link";
import { ArrowLeft, Calendar, Clock, GraduationCap, User, Users, Star, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ClientSession } from "@/lib/client/portal-actions";

interface ClientSessionDetailProps {
  session: ClientSession;
  centreId: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":");
  const h = parseInt(hours, 10);
  const suffix = h >= 12 ? "pm" : "am";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${minutes}${suffix}`;
}

function statusLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "completed") return "default";
  if (status === "confirmed" || status === "in_progress") return "secondary";
  return "outline";
}

export function ClientSessionDetail({ session, centreId }: ClientSessionDetailProps) {
  return (
    <div className="space-y-6">
      {/* Back link */}
      <Button
        variant="ghost"
        size="sm"
        render={<Link href={`/client/${centreId}/schedule`} />}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to Schedule
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{session.sport}</h1>
          <p className="text-sm text-gray-500">{formatDate(session.date)}</p>
        </div>
        <Badge variant={statusVariant(session.status)}>
          {statusLabel(session.status)}
        </Badge>
      </div>

      {/* Details */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Session Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 shrink-0 text-cyan-600" />
              <span>{formatDate(session.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 shrink-0 text-cyan-600" />
              <span>
                {formatTime(session.time)} ({session.duration_minutes} min)
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 shrink-0 text-cyan-600" />
              <span>Coach: {session.coach_name ?? "TBC"}</span>
            </div>
            {session.class_names.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <GraduationCap className="h-4 w-4 shrink-0 text-cyan-600" />
                <div className="flex flex-wrap gap-1.5">
                  {session.class_names.map((name) => (
                    <Badge key={name} variant="outline" className="text-xs">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {session.headcount !== null && (
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 shrink-0 text-cyan-600" />
                <span>{session.headcount} children attended</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Feedback */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {session.rating !== null ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-5 w-5 ${
                        star <= (session.rating ?? 0)
                          ? "fill-amber-400 text-amber-400"
                          : "text-gray-200"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium text-gray-700">
                  {session.rating}/5
                </span>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No feedback yet</p>
            )}

            {session.coach_notes && (
              <div className="mt-2">
                <div className="flex items-center gap-1 text-xs font-medium text-gray-500">
                  <MessageSquare className="h-3 w-3" />
                  Coach Observations
                </div>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                  {session.coach_notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Program */}
      {session.program_id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Program Delivered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {session.program_title ?? session.sport}
                </p>
                <p className="text-xs text-gray-500">
                  Tap to view the full program plan
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/client/${centreId}/programs/${session.program_id}`} />}
              >
                View Program
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
