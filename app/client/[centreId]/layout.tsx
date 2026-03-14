import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { ClientShell } from "@/components/client/client-shell";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;
  const { data: clientUser, error } = await getCurrentClientUser();

  if (error || !clientUser) {
    redirect("/client-login");
  }

  if (clientUser.centre_id !== centreId) {
    redirect(`/client/${clientUser.centre_id}`);
  }

  return <ClientShell clientUser={clientUser}>{children}</ClientShell>;
}
