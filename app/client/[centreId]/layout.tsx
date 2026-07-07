import { redirect } from "next/navigation";
import {
  getCurrentClientUser,
  getCurrentClientUserCentres,
} from "@/lib/client/actions";
import { getClientUnreadMessageCount } from "@/lib/client/portal-actions";
import { ClientShell } from "@/components/client/client-shell";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;
  const [{ data: clientUser, error }, centresRes, unreadMessages] =
    await Promise.all([
      getCurrentClientUser(centreId),
      getCurrentClientUserCentres(),
      getClientUnreadMessageCount(centreId),
    ]);

  if (error || !clientUser) {
    redirect("/client-login");
  }

  // The user might have multiple centres — only redirect when they
  // don't have access to the one in the URL. getCurrentClientUser
  // sets is_authorised_for_current after consulting the join.
  if (clientUser.is_authorised_for_current === false) {
    redirect(`/client/${clientUser.centre_id}`);
  }

  return (
    <ClientShell
      clientUser={clientUser}
      centres={centresRes.data ?? []}
      unreadMessages={unreadMessages}
    >
      {children}
    </ClientShell>
  );
}
