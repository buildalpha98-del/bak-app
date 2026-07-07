import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCentreMessageThreads,
  getCentreThread,
} from "@/lib/centre-messages/actions";
import { CentreInbox } from "@/components/centre-messages/centre-inbox";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ centre?: string }>;
}

export default async function OpsCentreMessagesPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { centre } = await searchParams;

  const [{ data: threads }, threadRes] = await Promise.all([
    getCentreMessageThreads(),
    centre ? getCentreThread(centre) : Promise.resolve({ data: null, error: null }),
  ]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#E8712A]">
          Communication
        </p>
        <h1 className="text-3xl font-bold font-heading tracking-tight text-foreground">
          Centre Inbox
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Messages from centre directors via the client portal. Opening a
          thread marks it as read.
        </p>
      </div>

      <CentreInbox
        threads={threads}
        selectedCentreId={centre ?? null}
        thread={threadRes.data}
      />
    </div>
  );
}
