import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFormTemplateById } from "@/lib/forms/actions";
import { TemplateEditor } from "@/components/forms/template-editor";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminTemplateEditorPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data } = await getFormTemplateById(id);
  if (!data) notFound();

  return (
    <TemplateEditor
      template={data}
      basePath="/admin/forms"
    />
  );
}
