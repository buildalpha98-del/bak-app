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

  const { data: status } = await getConnectionStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Integrations</h1>
        <p className="text-sm text-[#666666]">
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
