import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientChildren } from "@/lib/client/portal-actions";
import { ClientChildren } from "@/components/client/client-children";

export default async function ClientChildrenPage({
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

  const isSchool = clientUser.centre_type === "school";
  const { data, error } = await getClientChildren(centreId);

  if (error) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold font-heading text-foreground">
          {isSchool ? "Students" : "Children"}
        </h1>
        <p className="mt-4 text-muted-foreground">
          Unable to load {isSchool ? "student" : "children"} data. Please try again later.
        </p>
      </div>
    );
  }

  return <ClientChildren children={data} centreId={centreId} isSchool={isSchool} />;
}
