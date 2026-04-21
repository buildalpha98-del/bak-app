"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createBookableSession, getCoachesForDropdown } from "@/lib/bookings/actions";
import type { BookableSessionInput } from "@/lib/bookings/actions";
import { BookableSessionForm } from "@/components/bookings/session-form";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function OpsNewSessionPage() {
  const router = useRouter();
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getCoachesForDropdown().then(({ data }) => setCoaches(data));
  }, []);

  async function handleSubmit(data: BookableSessionInput) {
    setSubmitting(true);
    const result = await createBookableSession(data);
    setSubmitting(false);

    if (result.error) {
      toast.error("Could not create session. Please try again.");
      return { error: result.error };
    }

    toast.success("Bookable session created.");
    router.push("/ops/bookings/sessions");
    return { error: null };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/ops/bookings/sessions" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create Bookable Session</h1>
          <p className="text-sm text-muted-foreground">Set up a new session for parent booking</p>
        </div>
      </div>
      <BookableSessionForm
        coaches={coaches}
        onSubmit={handleSubmit}
        isSubmitting={submitting}
      />
    </div>
  );
}
