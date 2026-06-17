import { notFound, redirect } from "next/navigation";
import { getCentreDetail } from "@/lib/centres/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CentreDetailView } from "@/components/centres/centre-detail-view";

interface AdminCentreDetailPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function AdminCentreDetailPage({
  params,
}: AdminCentreDetailPageProps) {
  const { id } = await params;

  // Pull the profile up front so we can plumb financial_access into the
  // detail view; mirrors the pattern used by /admin/page.tsx.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, detail] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, financial_access")
      .eq("id", user.id)
      .single(),
    getCentreDetail(id),
  ]);

  if (detail.error || !detail.data) {
    notFound();
  }

  return (
    <CentreDetailView
      data={detail.data}
      basePath="/admin/centres"
      profile={profile ?? null}
    />
  );
}
