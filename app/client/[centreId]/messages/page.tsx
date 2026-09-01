import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getCentreMessages } from "@/lib/client/portal-actions";
import { ClientMessages } from "@/components/client/client-messages";

export default async function ClientMessagesPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  // Multi-campus: authorisation comes from the join table, not the
  // default centre. Bounce only when genuinely unauthorised.
  if (clientUser.is_authorised_for_current === false)
    redirect(`/client/${clientUser.centre_id}`);

  const { data: messages, error } = await getCentreMessages(centreId);

  if (error) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold font-heading text-foreground">Messages</h1>
        <p className="mt-4 text-muted-foreground">
          Unable to load messages. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <ClientMessages
      messages={messages}
      centreId={centreId}
      clientUserId={clientUser.id}
    />
  );
}
