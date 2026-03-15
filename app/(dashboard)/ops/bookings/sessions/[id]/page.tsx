import { getBookableSession, getSessionWaitlist } from "@/lib/bookings/actions";
import { SessionDetailClient } from "@/components/bookings/session-detail-client";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OpsSessionDetailPage({ params }: Props) {
  const { id } = await params;
  const [sessionResult, waitlistResult] = await Promise.all([
    getBookableSession(id),
    getSessionWaitlist(id),
  ]);

  if (sessionResult.error || !sessionResult.data) {
    notFound();
  }

  return (
    <SessionDetailClient
      session={sessionResult.data}
      waitlist={waitlistResult.data}
      basePath="/ops/bookings/sessions"
    />
  );
}
