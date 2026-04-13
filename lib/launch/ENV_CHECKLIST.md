# Launch Foundation — Environment Variables Checklist

All environment variables needed for the launch foundation layer.

## Required

| Variable | Description | Example |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend API key for sending emails | `re_xxxxxxxxxxxx` |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app (used in email links) | `https://app.buildalphakids.com.au` |

## Optional (with defaults)

| Variable | Description | Default |
|----------|-------------|---------|
| `BAK_FROM_EMAIL` | Sender email address | `noreply@buildalphakids.com.au` |
| `BAK_GST_REGISTERED` | Whether to add 10% GST to invoices | `false` |
| `BAK_ABN` | Business ABN for invoices | _(empty)_ |
| `BAK_BANK_BSB` | BSB for invoice payment details | _(empty)_ |
| `BAK_BANK_ACCOUNT` | Account number for invoice payment details | _(empty)_ |
| `BAK_BANK_NAME` | Bank name for invoice payment details | _(empty)_ |

## Already Configured (existing)

These should already be set from the existing deployment:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |

## Notes

- `BAK_GST_REGISTERED` is also stored in the `business_settings` table (key: `gst_enabled`). The env variable is used by the invoice generator as a quick check; the `business_settings` table is the source of truth for the full invoicing UI.
- Bank details (`BAK_BANK_*`) are also stored in `business_settings`. The env variables are used as fallback defaults.
- `BAK_FROM_EMAIL` must be a verified sender domain in Resend.
