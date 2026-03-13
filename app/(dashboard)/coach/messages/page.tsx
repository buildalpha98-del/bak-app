import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getConversations } from "@/lib/messages/actions";
import { MessagesPageClient } from "@/components/messages/messages-page-client";

export default async function CoachMessagesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const conversations = await getConversations();

  return (
    <div className="h-[calc(100vh-4rem)] animate-fade-up">
      <MessagesPageClient
        initialConversations={conversations}
        currentUserId={user.id}
        role="coach"
      />
    </div>
  );
}
