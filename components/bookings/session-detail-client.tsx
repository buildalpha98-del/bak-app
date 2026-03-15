"use client";

import { useRouter } from "next/navigation";
import { updateBookableSession } from "@/lib/bookings/actions";
import { SessionDetailView } from "@/components/bookings/session-detail-view";
import type { BookableSession, WaitlistEntry } from "@/lib/types/database";
import type { BookableSessionStatus } from "@/lib/types/enums";

interface SessionDetailClientProps {
  session: BookableSession;
  waitlist: WaitlistEntry[];
  basePath: string;
}

export function SessionDetailClient({ session, waitlist, basePath }: SessionDetailClientProps) {
  const router = useRouter();

  async function handleStatusChange(status: BookableSessionStatus) {
    const result = await updateBookableSession(session.id, { status });
    if (!result.error) {
      router.refresh();
    }
    return result;
  }

  return (
    <SessionDetailView
      session={session}
      waitlist={waitlist}
      basePath={basePath}
      onStatusChange={handleStatusChange}
    />
  );
}
