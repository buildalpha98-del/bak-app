import { notFound, redirect } from "next/navigation";
import { getCentreDetail } from "@/lib/centres/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CentreDetailView } from "@/components/centres/centre-detail-view";

interface OpsCentreDetailPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function OpsCentreDetailPage({
  params,
}: OpsCentreDetailPageProps) {
  const { id } = await params;

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
      basePath="/ops/centres"
      profile={profile ?? null}
    />
  );
}
