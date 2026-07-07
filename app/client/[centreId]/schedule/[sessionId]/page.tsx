import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientSessionDetail } from "@/lib/client/portal-actions";
import { ClientSessionDetail } from "@/components/client/client-session-detail";

export default async function ClientSessionPage({
  params,
}: {
  params: Promise<{ centreId: string; sessionId: string }>;
}) {
  const { centreId, sessionId } = await params;
  const { data: clientUser } = await getCurrentClientUser();

  if (!clientUser || clientUser.centre_id !== centreId) {
    redirect("/client-login");
  }

  const { data: session, error } = await getClientSessionDetail(sessionId, centreId);

  if (error || !session) {
    redirect(`/client/${centreId}/schedule`);
  }

  return (
    <div className="animate-fade-up space-y-4">
      <ClientSessionDetail session={session} centreId={centreId} />

      {/* Per-child attendance — who actually attended vs was away. */}
      {session.attendees.length > 0 && (
        <div className="rounded-2xl border bg-white p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Attendance ({session.attendees.filter((a) => a.present).length} of{" "}
            {session.attendees.length})
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {session.attendees.map((a) => (
              <li
                key={a.name}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="text-foreground">{a.name}</span>
                <span
                  className={
                    a.present
                      ? "text-xs font-medium text-emerald-600"
                      : "text-xs font-medium text-gray-400"
                  }
                >
                  {a.present ? "Attended" : "Away"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
