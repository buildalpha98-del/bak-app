import { getBookableSessions } from "@/lib/bookings/actions";
import { SessionListView } from "@/components/bookings/session-list-view";

export default async function OpsBookableSessionsPage() {
  const { data, error } = await getBookableSessions();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return <SessionListView initialData={data} basePath="/ops/bookings/sessions" />;
}
