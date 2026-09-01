import { redirect } from "next/navigation";
import { Shield, Users } from "lucide-react";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getCentreCoaches } from "@/lib/client/staff-actions";
import { StaffCard } from "@/components/client/staff-card";

export default async function StaffVerificationPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser();
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.centre_id !== centreId) redirect(`/client/${clientUser.centre_id}`);

  const coaches = await getCentreCoaches(centreId);

  return (
    <div className="animate-fade-up space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Our Coaches</h1>
        <p className="text-muted-foreground mt-1">Staff verification and compliance</p>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-portal-200 bg-portal-50 p-4 flex items-start gap-3">
        <Shield className="h-5 w-5 text-portal-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-portal-800">
          All Build Alpha Kids coaches hold verified Working With Children Checks and current First
          Aid certificates.
        </p>
      </div>

      {/* Coach grid */}
      {coaches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No coaches assigned yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Coaches will appear here once sessions are scheduled at your centre.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {coaches.map((coach) => (
            <StaffCard key={coach.id} coach={coach} />
          ))}
        </div>
      )}
    </div>
  );
}
