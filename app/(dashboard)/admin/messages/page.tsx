import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getConversations } from "@/lib/messages/actions";
import { getMessagesStatusPulse } from "@/lib/messages/status-pulse-actions";
import { MessagesPageClient } from "@/components/messages/messages-page-client";
import { MessagesStatusPulseStrip } from "@/components/messages/messages-status-pulse";
import { LoadError } from "@/components/ui/load-error";

export default async function AdminMessagesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let conversations;
  try {
    conversations = await getConversations();
  } catch {
    return (
      <LoadError message="Failed to load messages. Please try refreshing." />
    );
  }

  const pulse = await getMessagesStatusPulse();

  return (
    <div className="h-[calc(100vh-4rem)] animate-fade-up space-y-4">
      <MessagesStatusPulseStrip pulse={pulse} basePath="/admin/messages" />
      <MessagesPageClient
        initialConversations={conversations}
        currentUserId={user.id}
        role="admin"
      />
    </div>
  );
}
