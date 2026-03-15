"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getBookableSession,
  updateBookableSession,
  getCoachesForDropdown,
} from "@/lib/bookings/actions";
import type { BookableSessionInput } from "@/lib/bookings/actions";
import type { BookableSession } from "@/lib/types/database";
import { BookableSessionForm } from "@/components/bookings/session-form";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function OpsEditSessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<BookableSession | null>(null);
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      getBookableSession(params.id),
      getCoachesForDropdown(),
    ]).then(([sessionRes, coachRes]) => {
      setSession(sessionRes.data);
      setCoaches(coachRes.data);
      setLoading(false);
    });
  }, [params.id]);

  async function handleSubmit(data: BookableSessionInput) {
    setSubmitting(true);
    const result = await updateBookableSession(params.id, data);
    setSubmitting(false);

    if (result.error) return { error: result.error };

    router.push(`/ops/bookings/sessions/${params.id}`);
    return { error: null };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#E8712A]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          render={<Link href={`/ops/bookings/sessions/${params.id}`} />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Edit Session</h1>
          <p className="text-sm text-muted-foreground">{session?.title}</p>
        </div>
      </div>
      <BookableSessionForm
        initialData={session}
        coaches={coaches}
        onSubmit={handleSubmit}
        isSubmitting={submitting}
      />
    </div>
  );
}
