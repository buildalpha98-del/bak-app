import { redirect } from "next/navigation";
import {
  getCurrentClientUser,
  getActiveSharedLinks,
  getCurrentClientUserCentres,
  getCentreColleagues,
} from "@/lib/client/actions";
import { ClientSettings } from "@/components/client/client-settings";

export default async function ClientSettingsPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.is_authorised_for_current === false) {
    redirect(`/client/${clientUser.centre_id}`);
  }

  const isPrimary = clientUser.is_primary ?? false;

  const [sharedLinksRes, centresRes, colleaguesRes] = await Promise.all([
    isPrimary
      ? getActiveSharedLinks(centreId)
      : Promise.resolve({
          data: [] as Awaited<ReturnType<typeof getActiveSharedLinks>>["data"],
          error: null,
        }),
    getCurrentClientUserCentres(),
    isPrimary
      ? getCentreColleagues(centreId)
      : Promise.resolve({
          data: [] as Awaited<ReturnType<typeof getCentreColleagues>>["data"],
          error: null,
        }),
  ]);

  return (
    <ClientSettings
      isPrimary={isPrimary}
      centreId={centreId}
      sharedLinks={sharedLinksRes.data}
      linkedCentres={centresRes.data ?? []}
      currentUserName={clientUser.name ?? ""}
      colleagues={colleaguesRes.data}
    />
  );
}
