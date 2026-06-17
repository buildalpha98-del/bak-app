import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getInboxItems } from "@/lib/inbox/actions";
import { InboxView } from "@/components/inbox/inbox-view";

export const dynamic = "force-dynamic";

export default async function AdminInboxPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const { data: items, error } = await getInboxItems("admin");

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#E8712A] mb-1">
            Admin
          </p>
          <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
            Inbox
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything that needs you, all in one timeline.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <InboxView items={items} basePath="/admin/inbox" />
      )}
    </div>
  );
}
