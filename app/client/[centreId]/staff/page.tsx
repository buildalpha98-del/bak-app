import { redirect } from "next/navigation";
import { Download, Shield, Users } from "lucide-react";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getCentreCoaches } from "@/lib/client/staff-actions";
import { StaffCard } from "@/components/client/staff-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function StaffVerificationPage({
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

  const coaches = await getCentreCoaches(centreId);

  // Risk assessments + child-safety policies belong next to the WWCC
  // cards — the compliance conversation happens on this page, not
  // buried in Resources. Same visibility rules as the Resources page.
  const supabase = await createSupabaseServerClient();
  const { data: complianceDocs } = await supabase
    .from("documents")
    .select("id, title, file_url")
    .eq("visibility", "all")
    .in("category", ["risk_assessment", "policy"])
    .order("category")
    .order("title");

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

      {/* Policies & risk assessments — downloadable where the
          compliance conversation actually happens. */}
      {(complianceDocs ?? []).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Policies &amp; risk assessments
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {complianceDocs!.map((doc) => (
              <a
                key={doc.id}
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl border border-portal-200 bg-portal-50 px-3 py-2 text-sm font-medium text-portal-800 transition-colors hover:bg-portal-100"
              >
                <Download className="h-4 w-4 text-portal-600" />
                {doc.title}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
