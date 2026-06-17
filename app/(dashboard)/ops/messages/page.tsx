import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getConversations } from "@/lib/messages/actions";
import { getMessagesStatusPulse } from "@/lib/messages/status-pulse-actions";
import { MessagesPageClient } from "@/components/messages/messages-page-client";
import { MessagesStatusPulseStrip } from "@/components/messages/messages-status-pulse";

export default async function OpsMessagesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let conversations;
  try {
    conversations = await getConversations();
  } catch {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load messages. Please try refreshing.
      </div>
    );
  }

  const pulse = await getMessagesStatusPulse();

  return (
    <div className="h-[calc(100vh-4rem)] animate-fade-up space-y-4">
      <MessagesStatusPulseStrip pulse={pulse} basePath="/ops/messages" />
      <MessagesPageClient
        initialConversations={conversations}
        currentUserId={user.id}
        role="ops"
      />
    </div>
  );
}
