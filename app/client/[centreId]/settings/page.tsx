import { redirect } from "next/navigation";
import { getCurrentClientUser, getActiveSharedLinks } from "@/lib/client/actions";
import { ClientSettings } from "@/components/client/client-settings";

export default async function ClientSettingsPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser();
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.centre_id !== centreId) redirect(`/client/${clientUser.centre_id}`);

  const isPrimary = clientUser.is_primary ?? false;

  let sharedLinks: Awaited<ReturnType<typeof getActiveSharedLinks>>["data"] = [];
  if (isPrimary) {
    const { data } = await getActiveSharedLinks(centreId);
    sharedLinks = data;
  }

  return (
    <ClientSettings
      isPrimary={isPrimary}
      centreId={centreId}
      sharedLinks={sharedLinks}
    />
  );
}
