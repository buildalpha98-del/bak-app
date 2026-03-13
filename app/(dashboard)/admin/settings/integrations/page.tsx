import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConnectionStatus } from "@/lib/quickbooks/actions";
import { QBConnectionStatus } from "@/components/outbound-invoicing/qb-connection-status";

export default async function IntegrationsSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: status, error } = await getConnectionStatus();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Manage third-party integrations for invoicing and accounting.
        </p>
      </div>

      <QBConnectionStatus
        connected={status?.connected ?? false}
        companyName={status?.companyName ?? null}
        connectedAt={status?.connectedAt ?? null}
      />
    </div>
  );
}
