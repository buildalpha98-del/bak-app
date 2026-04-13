# Launch Foundation Layer

Shared infrastructure for all launch features. Created by migration `042_launch_foundation.sql`.

## New Database Tables

| Table | Purpose |
|-------|---------|
| `email_log` | Tracks all outbound emails (type, recipient, status, metadata) |
| `attendance` | Enhanced attendance with coach tracking, walk-in support, status enum |
| `session_notes` | Coach post-session notes with rating (1–5) |
| `session_photos` | Coach photo uploads per session (stored in Supabase Storage) |
| `child_observations` | Per-child notes from coach during a session |
| `invitations` | Bulk/individual user invites with role, expiry, status tracking |
| `invoices` | Centre/school invoices with number sequence (BAK-YYYY-XXXX) |
| `invoice_line_items` | Line items linked to invoices and optionally to sessions |
| `reminder_log` | Dedup tracking for cron-sent reminders (prevents double-sends) |

### Modified Tables

| Table | Change |
|-------|--------|
| `notifications` | Added `action_url text` and `metadata jsonb` columns |

## Shared Utility Files

| File | Exports | Purpose |
|------|---------|---------|
| `lib/launch/email.ts` | `sendEmail()`, `sendTemplatedEmail()` | Send emails via Resend with automatic logging to `email_log` |
| `lib/launch/notifications.ts` | `createNotification()`, `createBulkNotifications()` | Insert in-app notifications with tier mapping |
| `lib/launch/invoice-generator.ts` | `generateInvoiceNumber()`, `calculateCentreInvoice()`, `calculateSchoolInvoice()` | Invoice number sequence, centre/school invoice calculation |
| `lib/launch/storage-setup.ts` | `setupStorageBuckets()` | One-time setup for `session-photos` and `invoices` storage buckets |
| `lib/launch/types.ts` | All TypeScript interfaces and type unions | Types for every new table + calculated invoice types + email templates |

## Storage Buckets

| Bucket | Access | Allowed Types | Max Size |
|--------|--------|---------------|----------|
| `session-photos` | Coaches upload, admin reads all | JPEG, PNG, WebP, HEIC | 10 MB |
| `invoices` | Admin uploads, centre directors read own | PDF | 5 MB |

Run `setupStorageBuckets()` from `lib/launch/storage-setup.ts` once to create these.

## Environment Variables

See [ENV_CHECKLIST.md](./ENV_CHECKLIST.md) for the full list. Key new variables:

- `BAK_FROM_EMAIL` — sender email (default: noreply@buildalphakids.com.au)
- `BAK_GST_REGISTERED` — set to `"true"` to enable 10% GST on invoices
- `BAK_ABN`, `BAK_BANK_BSB`, `BAK_BANK_ACCOUNT`, `BAK_BANK_NAME` — invoice payment details

## Existing Infrastructure Used

| Component | Path | Notes |
|-----------|------|-------|
| Resend client | `lib/email/client.ts` | Email provider (already installed) |
| Resend send | `lib/email/send.ts` | Base `sendEmail()` function |
| Email templates | `lib/email/templates.ts` | Existing branded templates |
| Supabase admin | `lib/supabase/admin.ts` | `createSupabaseAdmin()` — bypasses RLS |
| Supabase server | `lib/supabase/server.ts` | `createSupabaseServer()` — user-scoped with RLS |
| Supabase client | `lib/supabase/client.ts` | Browser client |
| UI components | `components/ui/` | shadcn/ui (button, card, dialog, table, etc.) |
| Toast | `components/ui/sonner.tsx` | Sonner toast notifications |
| Database types | `lib/types/database.ts` | Existing table type definitions |
| Enums | `lib/types/enums.ts` | Shared TypeScript enums |
| Server actions | `lib/[feature]/actions.ts` | Pattern: `"use server"` directive at top |

## Data Flow Map

### Coach marks attendance
```
Coach marks attendance → attendance table
  → feeds invoice calculation (calculateCentreInvoice / calculateSchoolInvoice)
  → parent notification "session report ready"
  → centre impact (health score input)
```

### Session completed
```
Session completed by coach
  → session_notes table (general notes + rating)
  → session_photos table (photos stored in 'session-photos' bucket)
  → child_observations table (per-child notes)
  → triggers parent notification via createNotification()
```

### Invoice generated
```
calculateCentreInvoice() / calculateSchoolInvoice()
  → invoices table + invoice_line_items table
  → PDF generated and stored in 'invoices' bucket
  → sendTemplatedEmail('invoice_ready', ...) → email_log
  → createNotification({ type: 'invoice_ready' }) → notifications
  → centre director reads via client portal
```

### Invitation sent
```
Admin creates invitation → invitations table
  → sendTemplatedEmail('invitation', ...) → email sent + email_log
  → user clicks link → registers → has_completed_onboarding = false
  → onboarding wizard
```

### Cron sends reminders
```
Cron job triggers (daily 6pm for parent, daily 6am for coach)
  → checks reminder_log for existing sends (dedup)
  → sendTemplatedEmail('session_reminder_parent/coach', ...)
  → createNotification({ type: 'session_reminder' })
  → logs to reminder_log + email_log
```

## RLS Summary

| Table | Admin | Coach | Centre Director | Parent |
|-------|-------|-------|-----------------|--------|
| `email_log` | Read | — | — | — |
| `attendance` | Full | Own sessions | Own centre sessions | Own children |
| `session_notes` | Full | Own notes | Own centre sessions | — |
| `session_photos` | Full | Own uploads | Own centre sessions | — |
| `child_observations` | Full | Own observations | Own centre sessions | Own children |
| `invitations` | Full | — | — | — |
| `invoices` | Full | — | Own invoices | — |
| `invoice_line_items` | Full | — | Own invoice items | — |
| `reminder_log` | — | — | — | — (service role only) |
