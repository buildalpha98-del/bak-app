import { getBookableSession, getSessionWaitlist, updateBookableSession } from "@/lib/bookings/actions";
import { SessionDetailClient } from "@/components/bookings/session-detail-client";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminSessionDetailPage({ params }: Props) {
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
      basePath="/admin/bookings/sessions"
    />
  );
}
