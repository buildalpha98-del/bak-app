# Operational Communications Module — Design Spec

## Overview

Structured operational messaging for Build Alpha Kids. Three features: announcements (broadcast), direct messages (1:1 ops-coach), and shift threads (session-specific discussion with replies). Casual chat stays on WhatsApp — this is for operational communication only.

## Existing Infrastructure

### Database (already migrated)
- `announcements` — id, title, body (text NOT NULL), attachments (jsonb), audience (enum: all/ops_and_coaches/coaches_only), created_by, created_at
- `announcement_reads` — announcement_id, user_id, read_at (unique pair)
- `shift_threads` — id, session_id, user_id, content (text NOT NULL), created_at
- `direct_messages` — id, sender_id, recipient_id, content (text NOT NULL), read_at, created_at
- `notifications` — full notification system with tiers, push, email, Realtime
- RLS policies in place for all tables

### Existing RLS Policies (relevant)
- Admin/Ops: FOR ALL on announcements, announcement_reads, shift_threads, direct_messages
- Coach announcements: SELECT only where `audience IN ('all', 'coaches_only')` — NOTE: does NOT include 'ops_and_coaches'
- Coach shift_threads: FOR ALL where `session_id IN (SELECT id FROM sessions WHERE coach_id = auth.uid())`
- Coach DMs: SELECT where sender_id or recipient_id = auth.uid(); INSERT where sender_id = auth.uid(); UPDATE where recipient_id = auth.uid() (read receipts only)

### Types (already defined in lib/types)
- `Announcement`, `AnnouncementRead`, `ShiftThread`, `DirectMessage`, `Notification`
- `AnnouncementAudience`, `NotificationChannel`, `NotificationEventType` enums

### Notification system (already built)
- `triggerNotification(event, recipients)` — inserts DB record, sends push/email based on tier and preferences
- `triggerNotificationForOps(event)` — sends to all active admin/ops
- Realtime hook: `useNotificationsRealtime` for live delivery to bell icon
- Event tiers already include `announcement_posted` as IMPORTANT

### Navigation config
- `components/shared/navigation/nav-config.ts` — NAV_CONFIG record + getMobileItems function
- `components/shared/navigation/bottom-tabs.tsx` — mobile bottom tab bar (uses getMobileItems)
- `components/shared/navigation/sidebar.tsx` — desktop sidebar

### Existing components
- `components/coach/home/latest-announcement.tsx` — coach home card, links to `/coach/announcements`
- `components/coach/schedule/shift-thread.tsx` — basic message list + input (no Realtime, no replies)
- `components/shared/navigation/notification-bell.tsx` — notification dropdown with icon mapping

### Existing server actions
- `getLatestAnnouncement(userId)` in `lib/sessions/coach-actions.ts`
- `addShiftThreadMessage(sessionId, content)` in `lib/sessions/coach-actions.ts`

## New Migration — `supabase/migrations/016_communications_enhancement.sql`

```sql
-- ============================================================
-- Migration 016: Communications enhancements
-- Adds edit/delete to DMs and shift threads, threaded replies,
-- fixes RLS policies, enables Realtime
-- ============================================================

-- 1. Direct messages: add edit/delete support
-- Drop NOT NULL on content to support soft delete (content set to null)
ALTER TABLE direct_messages ALTER COLUMN content DROP NOT NULL;
ALTER TABLE direct_messages ADD COLUMN updated_at timestamptz;
ALTER TABLE direct_messages ADD COLUMN deleted_at timestamptz;

-- 2. Shift threads: add edit/delete + threaded replies
-- Drop NOT NULL on content to support soft delete
ALTER TABLE shift_threads ALTER COLUMN content DROP NOT NULL;
ALTER TABLE shift_threads ADD COLUMN updated_at timestamptz;
ALTER TABLE shift_threads ADD COLUMN deleted_at timestamptz;
ALTER TABLE shift_threads ADD COLUMN parent_message_id uuid REFERENCES shift_threads(id) ON DELETE CASCADE;

-- 3. Indexes
CREATE INDEX idx_shift_threads_parent ON shift_threads(parent_message_id) WHERE parent_message_id IS NOT NULL;
CREATE INDEX idx_direct_messages_conversation ON direct_messages(sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_direct_messages_recipient ON direct_messages(recipient_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_announcements_created ON announcements(created_at DESC);
CREATE INDEX idx_announcement_reads_announcement ON announcement_reads(announcement_id);

-- 4. Fix RLS: coaches need to UPDATE their own sent DMs (for edit/delete)
CREATE POLICY "coach_update_own_sent_dms" ON direct_messages
  FOR UPDATE USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- 5. Fix RLS: coaches should see 'ops_and_coaches' announcements too
DROP POLICY IF EXISTS "coach_read_announcements" ON announcements;
CREATE POLICY "coach_read_announcements" ON announcements
  FOR SELECT USING (
    auth_user_role() = 'coach'
    AND audience IN ('all', 'ops_and_coaches', 'coaches_only')
  );

-- 6. Enable Realtime on messaging tables
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE shift_threads;
```

### New notification events

Add to `NotificationEventType` enum in `lib/types/enums.ts`:
- `dm_received` — IMPORTANT tier (push + email fallback)
- `shift_thread_message` — INFORMATIONAL tier (in-app only)

Add to `EVENT_TIER_MAP` in `lib/notifications/events.ts`.

## Input Validation Limits

| Field | Max Length |
|-------|-----------|
| Announcement title | 200 chars |
| Announcement body | 10,000 chars |
| DM content | 2,000 chars |
| Shift thread message | 2,000 chars |

Validate both client-side (textarea maxLength) and server-side (reject if exceeded).

## Feature 1: Announcements

### Server Actions — `lib/announcements/actions.ts`

**`getAnnouncements(page?: number)`**
- Returns paginated announcements (20 per page), newest first
- Includes: author name from profiles join, read count (count of announcement_reads), total audience count (active coaches/all), whether current user has read it
- RLS handles audience filtering automatically — no manual filter needed
- Page defaults to 1; offset = (page - 1) * 20

**`getAnnouncementDetail(announcementId: string)`**
- Returns full announcement with author info
- For admin/ops: includes read receipts array — query announcement_reads joined with profiles for (user name, read_at)
- For coaches: auto-calls markAnnouncementRead on view

**`createAnnouncement(data: { title: string; body: string; audience: AnnouncementAudience; attachments?: string[] })`**
- Admin/ops only (check role via auth)
- Validate: title <= 200 chars, body <= 10,000 chars, title and body required
- Insert to announcements table
- Determine audience: query active profiles where role matches audience
- Call triggerNotification for each recipient: event type `announcement_posted`, tier IMPORTANT
- entity_type: 'announcement', entity_id: new announcement ID

**`markAnnouncementRead(announcementId: string)`**
- Upsert to announcement_reads (ON CONFLICT DO NOTHING)
- Called automatically when coach opens announcement detail

### Components — `components/announcements/`

**announcement-list.tsx** (client component)
- Props: `initialAnnouncements`, `canCreate`, `role`
- Maps to AnnouncementCard components
- "New Announcement" button at top (if canCreate) — opens CreateAnnouncementForm dialog
- Empty state: Megaphone icon + "No announcements yet" + description
- "Load More" pagination button at bottom (fetches next page via getAnnouncements)

**announcement-card.tsx**
- Card with card-hover class
- Title (font-heading), body preview (2 lines via line-clamp-2), author initials avatar + name, relative timestamp
- Audience badge: "All" uses bg-secondary, "Coaches Only" uses bg-primary/10 text-primary
- Read count: "Read by 7/10 coaches" (shown only when role is admin/ops)
- Unread dot: orange dot indicator if current user hasn't read it
- onClick opens AnnouncementDetail sheet

**announcement-detail.tsx** (Sheet component)
- Full Markdown body rendered with react-markdown + Tailwind prose classes
- Author info + timestamp header
- Attachments list (links to Document Hub) if present
- Read receipts section (admin/ops only): list of names with checkmark + "read 2h ago"
- Unread coaches shown greyed out at bottom of receipts list
- Auto-calls markAnnouncementRead on mount for coaches

**create-announcement-form.tsx** (Dialog)
- Title: text input (required, maxLength 200)
- Body: textarea (required, maxLength 10000) with Markdown hint bar
- Audience: Select dropdown (All, Coaches Only)
- Publish button with Loader2 spinner on submitting
- On success: toast("Announcement published") + close dialog + router.refresh()

### Pages

**`app/(dashboard)/ops/announcements/page.tsx`** — replace existing stub
- Server component: fetch announcements, pass to AnnouncementList with canCreate=true, role="ops"

**`app/(dashboard)/admin/announcements/page.tsx`** — replace existing stub
- Same as ops, role="admin"

**`app/(dashboard)/coach/announcements/page.tsx`** — new page
- Server component: fetch announcements, pass to AnnouncementList with canCreate=false, role="coach"

### Markdown Rendering
- Install `react-markdown` package
- Use Tailwind `prose prose-sm` classes for rendered output within announcement-detail
- No additional sanitisation needed (react-markdown strips raw HTML by default)
- Store raw Markdown in the `body` text column

## Feature 2: Direct Messages

### Server Actions — `lib/messages/actions.ts`

**`getConversations()`**
- Returns conversation list for current user
- SQL approach: use a CTE that unions (sender_id, recipient_id) and (recipient_id, sender_id), then for each distinct partner, use LATERAL join to get the most recent message:
```sql
WITH partners AS (
  SELECT DISTINCT
    CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS partner_id
  FROM direct_messages
  WHERE sender_id = $1 OR recipient_id = $1
)
SELECT
  p.partner_id,
  pr.full_name,
  pr.role,
  lm.content AS last_message,
  lm.created_at AS last_message_at,
  lm.sender_id AS last_message_sender,
  (SELECT count(*) FROM direct_messages
   WHERE sender_id = p.partner_id AND recipient_id = $1 AND read_at IS NULL
  ) AS unread_count
FROM partners p
JOIN profiles pr ON pr.id = p.partner_id
LEFT JOIN LATERAL (
  SELECT content, created_at, sender_id FROM direct_messages
  WHERE (sender_id = $1 AND recipient_id = p.partner_id)
     OR (sender_id = p.partner_id AND recipient_id = $1)
  ORDER BY created_at DESC LIMIT 1
) lm ON true
ORDER BY lm.created_at DESC NULLS LAST;
```
- Each result: partner_id, full_name, role, last_message (preview), last_message_at, last_message_sender, unread_count

**`getConversationMessages(otherUserId: string, before?: string)`**
- Returns 50 messages between current user and otherUserId
- Ordered by created_at ASC (oldest first for display)
- Cursor: `before` is a created_at ISO timestamp; query `WHERE created_at < before` for loading older messages
- Returns: id, sender_id, content, created_at, updated_at, deleted_at
- Side effect: bulk UPDATE `SET read_at = now()` on messages where sender_id = otherUserId AND recipient_id = current user AND read_at IS NULL

**`sendDirectMessage(recipientId: string, content: string)`**
- Validate: content <= 2000 chars, content required (trim and check)
- Insert to direct_messages with sender_id = current user
- Trigger notification: type `dm_received`, tier IMPORTANT
- entity_type: 'direct_message', entity_id: sender's user ID (so URL builder routes to /messages?coach={senderId})
- Returns the new message record

**`editDirectMessage(messageId: string, newContent: string)`**
- Validate: newContent <= 2000 chars, required
- Fetch message, verify sender_id = current user AND deleted_at IS NULL
- Update: content = newContent, updated_at = now()

**`deleteDirectMessage(messageId: string)`**
- Fetch message, verify sender_id = current user AND deleted_at IS NULL
- Soft delete: SET content = null, deleted_at = now()

**`getContactsForMessaging()`**
- For admin/ops: returns active coaches (id, full_name) — query profiles WHERE role = 'coach' AND status = 'active'
- For coaches: returns active admin/ops users (id, full_name, role) — query profiles WHERE role IN ('admin', 'ops') AND status = 'active'
- Available to all roles (coach can initiate messages)

### Components — `components/messages/`

**conversation-list.tsx** (client component)
- Props: `initialConversations`, `selectedId?`, `onSelect`, `role`
- List of conversation cards sorted by last_message_at
- Each card: initials avatar, name, last message preview (line-clamp-1), relative timestamp, unread count badge (primary bg)
- Selected conversation: bg-primary/5 border-l-2 border-primary
- "New Message" button at top — opens NewMessageDialog
- Empty state: MessageSquare icon + "No conversations yet" + "Start a conversation"

**conversation-thread.tsx** (client component)
- Props: `otherUserId`, `otherUserName`, `currentUserId`, `onBack?`
- Header: back arrow (mobile only via onBack), user name
- Scrollable message area with ref for auto-scroll
- Renders MessageBubble for each message
- "Load older" button at top if hasMore (fetches with before cursor)
- Input: textarea + send button (Enter to send, Shift+Enter for newline)
- Realtime: subscribe to direct_messages INSERT where (sender_id = otherUserId AND recipient_id = me) — append new messages
- Realtime: subscribe to direct_messages UPDATE for edit/delete — update in-place
- Auto-marks messages read on mount and on new incoming messages

**message-bubble.tsx**
- Props: `message`, `isOwn`, `onEdit`, `onDelete`
- Own: right-aligned, bg-primary text-primary-foreground, rounded-2xl rounded-br-md
- Others: left-aligned, bg-card border, rounded-2xl rounded-bl-md
- Content text + relative timestamp (text-xs, muted)
- If updated_at && !deleted_at: show "(edited)" in text-xs
- If deleted_at: show "This message was deleted" in italic text-muted-foreground, no actions
- Own messages: hover reveals Edit (Pencil) and Delete (Trash2) icon buttons
- Edit mode: textarea replaces content, Save/Cancel buttons below
- Delete: confirm via small inline "Delete?" with confirm/cancel

**new-message-dialog.tsx**
- Dialog with searchable contact list (via getContactsForMessaging)
- Filter contacts by name as user types
- Click contact → call onSelect(contactId) which navigates to that conversation

### Pages

**`app/(dashboard)/ops/messages/page.tsx`** (client component page)
- Uses `searchParams.coach` for deep linking to a specific conversation
- Desktop (md+): flex row — ConversationList (w-80) | ConversationThread (flex-1)
- Mobile: show ConversationList OR ConversationThread based on whether a conversation is selected
- State: selectedConversation (otherUserId)

**`app/(dashboard)/admin/messages/page.tsx`**
- Same component/layout as ops messages

**`app/(dashboard)/coach/messages/page.tsx`**
- Same layout, role="coach"

### Realtime Integration
- Use Supabase client `channel.on('postgres_changes', ...)` for direct_messages table
- Filter: `recipient_id=eq.{currentUserId}` for INSERT events
- On new message from active conversation partner: append to thread, auto-scroll
- On new message from different partner: update conversation list (move to top, increment unread)
- For UPDATE events (edit/delete): update the specific message in state by matching id

## Feature 3: Shift Threads (Enhanced)

### Server Actions — extend `lib/sessions/coach-actions.ts`

**`addShiftThreadMessage(sessionId: string, content: string, parentMessageId?: string)`**
- Existing action — add optional parentMessageId parameter
- Validate: content <= 2000 chars, required
- If parentMessageId: verify it exists and belongs to same session_id
- Insert with parent_message_id set
- After insert: determine other participants in thread (assigned coach + all ops who have posted)
- Trigger `shift_thread_message` notification for each, INFORMATIONAL tier
- entity_type: 'session', entity_id: sessionId

**`editShiftThreadMessage(messageId: string, newContent: string)`**
- Validate: newContent <= 2000 chars, required
- Fetch message, verify user_id = current user AND deleted_at IS NULL
- Update: content = newContent, updated_at = now()

**`deleteShiftThreadMessage(messageId: string)`**
- Fetch message, verify user_id = current user AND deleted_at IS NULL
- Soft delete: SET content = null, deleted_at = now()

### Component Enhancement — `components/coach/schedule/shift-thread.tsx`

Enhanced from flat list to threaded:
- Top-level messages: `parent_message_id IS NULL`, ordered by created_at ASC
- Each message shows: author name, content, timestamp, reply count
- "Reply" button on each message — click shows inline reply input below
- Reply count: "3 replies" — click toggles collapsible indented reply section
- Replies indented with left border (border-l-2 border-border pl-4 ml-4)
- Edit/delete on own messages: hover reveals Pencil + Trash2 icon buttons (same pattern as DM)
- "(edited)" and "This message was deleted" indicators
- Realtime: subscribe to shift_threads INSERT where session_id = current session
- New top-level messages append at bottom; new replies append under their parent
- Realtime UPDATE: update message in-place for edits/deletes

### Ops/Admin Session Detail
- The session detail view in ops portal should render the same ShiftThread component
- Pass the session_id and current user context
- Ops/admin can post and reply to any session's thread

## Navigation Updates

### Nav config (`components/shared/navigation/nav-config.ts`)
- Add MessageSquare icon to imports
- Coach nav: add `{ label: "Messages", href: "/coach/messages", icon: MessageSquare, mobileOrder: 4 }`
- Shift existing coach mobileOrder: Docs becomes 5, Profile becomes 6 (or drop one to keep 5 tabs)
- Decision: Replace "Docs" from bottom bar (keep in sidebar). Coach mobile bottom tabs: Home(1), Schedule(2), Forms(3), Messages(4), Profile(5)
- Ops nav: add `{ label: "Messages", href: "/ops/messages", icon: MessageSquare }` after Announcements
- Admin nav: add `{ label: "Messages", href: "/admin/messages", icon: MessageSquare }` after Announcements

### Notification URL routing (`lib/notifications/url-builder.ts`)
- Add case for `direct_message`: `/${role}/messages?coach=${entityId}`
- Add case for `shift_thread` (if not already handled by session): already routes via session entity_type
- `announcement` already routes to `/${role}/announcements`

## Type Updates — `lib/types/database.ts`

```typescript
// Extend ShiftThread
export interface ShiftThread {
  id: string;
  session_id: string;
  user_id: string;
  content: string | null;  // nullable for soft delete
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  parent_message_id: string | null;
}

// Extend DirectMessage
export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string | null;  // nullable for soft delete
  read_at: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}
```

## New Files Summary

```
supabase/migrations/016_communications_enhancement.sql
lib/announcements/actions.ts
lib/messages/actions.ts
components/announcements/announcement-list.tsx
components/announcements/announcement-card.tsx
components/announcements/announcement-detail.tsx
components/announcements/create-announcement-form.tsx
components/messages/conversation-list.tsx
components/messages/conversation-thread.tsx
components/messages/message-bubble.tsx
components/messages/new-message-dialog.tsx
app/(dashboard)/ops/announcements/page.tsx        (replace stub)
app/(dashboard)/admin/announcements/page.tsx       (replace stub)
app/(dashboard)/coach/announcements/page.tsx       (new)
app/(dashboard)/ops/messages/page.tsx              (new)
app/(dashboard)/admin/messages/page.tsx            (new)
app/(dashboard)/coach/messages/page.tsx            (new)
```

## Modified Files

```
components/coach/schedule/shift-thread.tsx          (add replies, edit, delete, Realtime)
lib/sessions/coach-actions.ts                       (extend addShiftThreadMessage, add edit/delete)
lib/types/enums.ts                                  (add dm_received, shift_thread_message)
lib/types/database.ts                               (extend ShiftThread, DirectMessage)
lib/notifications/events.ts                         (add new events + tiers)
lib/notifications/url-builder.ts                    (add dm URL mapping)
components/shared/navigation/nav-config.ts          (add Messages nav items)
```

## What We Are NOT Building
- No file sharing in DMs (use Document Hub)
- No group chats
- No message search
- No typing indicators
- No online/offline presence
- No announcement editing after publish (create a new one)
- No announcement deletion (could add later)
