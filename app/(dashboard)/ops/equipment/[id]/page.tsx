import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getKitDetail } from "@/lib/equipment/actions";
import { KitDetailView } from "@/components/equipment/kit-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OpsKitDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data } = await getKitDetail(id);
  if (!data) notFound();

  return (
    <KitDetailView
      kit={data}
      userRole="ops"
      basePath="/ops/equipment"
    />
  );
}
