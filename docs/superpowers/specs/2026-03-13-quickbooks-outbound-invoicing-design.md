# QuickBooks Online Integration — Outbound Invoicing

## Overview

Integrate QuickBooks Online with the Build Alpha Kids platform to manage outbound invoicing (BAK billing centres and schools). This covers the full lifecycle: OAuth connection, customer sync, invoice generation from session data, approval workflow, push to QuickBooks, and payment status tracking.

## Approach

Use `intuit-oauth` for OAuth 2.0 token management and direct REST calls to the QuickBooks API for the ~5 endpoints needed (create/update Customer, create Invoice, query Invoice). No full SDK wrapper — a thin client in `lib/quickbooks/` keeps it simple and maintainable.

---

## 1. Database Changes

### New table: `integration_tokens`

Stores OAuth credentials for third-party integrations (currently QuickBooks only, extensible).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| provider | varchar(50) NOT NULL | `'quickbooks'` |
| access_token_encrypted | text NOT NULL | AES-256-GCM encrypted via server-side `QB_TOKEN_ENCRYPTION_KEY` |
| refresh_token_encrypted | text NOT NULL | AES-256-GCM encrypted via server-side `QB_TOKEN_ENCRYPTION_KEY` |
| realm_id | varchar(100) | QB company ID |
| token_expiry | timestamptz NOT NULL | When access token expires |
| company_name | text | Display name fetched from QB |
| connected_by | uuid FK → profiles | Who initiated the connection |
| connected_at | timestamptz | `DEFAULT now()` |
| updated_at | timestamptz | Auto-trigger via `update_updated_at()` |

**Token encryption:** Tokens are encrypted/decrypted at the application layer using AES-256-GCM with a server-side key (`QB_TOKEN_ENCRYPTION_KEY` env var). Encryption/decryption helpers live in `lib/quickbooks/crypto.ts`. The DB never stores plaintext tokens.

**RLS:** Admin-only read/write. No ops or coach access.

**Migration must include:**
- `ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;`
- Admin-only SELECT/INSERT/UPDATE/DELETE policy (matching pattern from `006_rls_policies.sql`)
- `CREATE TRIGGER integration_tokens_updated_at BEFORE UPDATE ON integration_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at();`

### Alter `centres`

Add column: `qb_customer_id varchar(100)` — nullable. Stores the QuickBooks Customer ID after sync.

### Alter `outbound_invoices`

Add columns:
- `invoice_number varchar(50) UNIQUE` — nullable. Format: `BAK-OUT-YYYYMM-NNN`. Coach invoices already have this; outbound invoices need it for QB push and display. UNIQUE constraint prevents duplicates.
- `created_by uuid REFERENCES profiles(id) ON DELETE SET NULL` — who generated the invoice

### Atomic invoice number generation

Use a PostgreSQL function to guarantee unique sequential numbers under concurrency:

```sql
CREATE OR REPLACE FUNCTION next_outbound_invoice_number(year_month text)
RETURNS text AS $$
DECLARE
  next_seq int;
  inv_number text;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS int)
  ), 0) + 1
  INTO next_seq
  FROM outbound_invoices
  WHERE invoice_number LIKE 'BAK-OUT-' || year_month || '-%'
  FOR UPDATE;

  inv_number := 'BAK-OUT-' || year_month || '-' || LPAD(next_seq::text, 3, '0');
  RETURN inv_number;
END;
$$ LANGUAGE plpgsql;
```

Called within a transaction during invoice generation to prevent race conditions.

### TypeScript type updates

- Add `IntegrationToken` interface to `lib/types/database.ts`
- Add `qb_customer_id` to the `Centre` interface
- Add `invoice_number` and `created_by` to the `OutboundInvoice` interface
- Update `OutboundInvoice.line_items_json` type from `Record<string, unknown>[]` to `OutboundLineItem[]` (matching the typed pattern used by `InvoiceLineItem[]` on coach invoices)

---

## 2. QuickBooks OAuth Connection

### Environment variables

| Variable | Purpose |
|----------|---------|
| `QB_CLIENT_ID` | Intuit developer app Client ID |
| `QB_CLIENT_SECRET` | Intuit developer app Client Secret |
| `QB_REDIRECT_URI` | `{NEXT_PUBLIC_APP_URL}/api/integrations/quickbooks/callback` |
| `QB_ENVIRONMENT` | `sandbox` or `production` — determines API base URL (`sandbox-quickbooks.api.intuit.com` vs `quickbooks.api.intuit.com`). `intuit-oauth` handles this via its `environment` config. |
| `QB_TOKEN_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM encryption of stored tokens |
| `QB_DEFAULT_ITEM_ID` | QuickBooks Item ID for "Coaching Services" line items (must be created manually in QB first) |

### OAuth flow

1. Admin navigates to `/admin/settings/integrations`
2. Clicks "Connect to QuickBooks"
3. Server action constructs the Intuit authorisation URL:
   - Scopes: `com.intuit.quickbooks.accounting`
   - State parameter: CSRF token stored in a short-lived cookie
4. User authorises on Intuit's site
5. Intuit redirects to `/api/integrations/quickbooks/callback` with `code`, `state`, `realmId`
6. Callback route:
   a. Validates state parameter against cookie
   b. Exchanges code for tokens using `intuit-oauth`
   c. Fetches company info from QB API (`/v3/company/{realmId}/companyinfo/{realmId}`)
   d. Upserts into `integration_tokens` (provider = 'quickbooks')
   e. Redirects to `/admin/settings/integrations?connected=true`
7. Settings page shows success toast

### Token auto-refresh

A `getQuickBooksClient()` helper in `lib/quickbooks/client.ts`:
- Reads the token from `integration_tokens`
- If token expires within 5 minutes, refreshes via `intuit-oauth` and updates the DB row
- Returns a configured client object with `realmId` and valid `accessToken`
- If no token exists or refresh fails, throws a descriptive error

### Settings page UI (`/admin/settings/integrations`)

**Disconnected state:**
- Heading: "QuickBooks Online"
- Description: "Connect your QuickBooks account to push outbound invoices directly."
- "Connect to QuickBooks" button (primary, orange)

**Connected state:**
- Green "Connected" badge
- Company name and connected date
- "Disconnect" button (destructive variant)
- Disconnect: deletes the `integration_tokens` row, clears all `qb_customer_id` values on centres (they'd be stale if reconnecting to a different QB company), logs to `activity_log`

---

## 3. Customer Sync

### Per-centre sync

A "Sync to QuickBooks" button on each centre detail page (visible to admin and ops when QB is connected).

**Logic:**
1. Check if centre has `qb_customer_id`
2. If no: create a QB Customer via `POST /v3/company/{realmId}/customer`
   - DisplayName: centre name
   - PrimaryEmailAddr: primary contact email
   - PrimaryPhone: primary contact phone
   - CompanyName: centre name
   - BillAddr: `{ Line1: centre.address }` (if address exists)
3. If yes: update the existing QB Customer via sparse update
4. Store/update `qb_customer_id` on the centres row
5. Log to `activity_log`

### Bulk sync

"Sync All Centres to QuickBooks" button on the centres list page.

**Logic:**
1. Fetch all centres with `contract_status` in ('active', 'trial')
2. Process centres sequentially with a 200ms delay between API calls to avoid QB rate limits (~40 centres = ~8 seconds total)
3. Track results: `{ synced: number, failed: { centreId, name, error }[] }`
4. Display summary dialog with results
5. Log bulk action to `activity_log`

---

## 4. Outbound Invoice Generation

### Page: `/app/(dashboard)/ops/invoicing/outbound/page.tsx`

### Generate flow

1. Ops clicks "Generate Invoices" button, opening a dialog
2. Selects billing period via date range picker (defaults to previous fortnight)
3. Server action `calculateOutboundInvoices(periodStart, periodEnd)`:
   a. Queries all completed sessions in the period, joined with centres
   b. Groups sessions by `centre_id`
   c. Calculates amount per centre based on `pricing_model`:
      - `centre_funded`: count of sessions x centre's `agreed_rate`
      - `parent_funded`: sum of (session `headcount` x $10)
      - `per_head` (schools): sum of (session `headcount` x $5)
   d. Returns preview data: `{ centreId, centreName, pricingModel, sessionCount, totalAmount, lineItems[] }`
4. Preview table displays: centre name, pricing model, session count, calculated amount
5. **Duplicate detection:** Before showing the preview, check for existing `outbound_invoices` that overlap the selected period for each centre. If found, exclude those centres from the preview and show a warning: "X centres already have invoices for this period."
6. Ops reviews and clicks "Generate All"
6. Server action `generateOutboundInvoices(periodStart, periodEnd, previews[])`:
   a. For each centre, creates an `outbound_invoices` record:
      - `status: 'draft'`
      - `invoice_number`: `BAK-OUT-YYYYMM-NNN` (sequential)
      - `line_items_json`: array of `{ session_id, date, sport, coach_name, headcount, rate, amount }`
      - `amount`: calculated total
   b. Logs each to `activity_log`
   c. Revalidates paths

### Line item structure (JSON)

```typescript
interface OutboundLineItem {
  session_id: string;
  date: string;
  sport: string;
  coach_name: string;
  headcount: number | null;
  rate: number;
  amount: number;
  description: string; // e.g. "Soccer coaching — 15 Mar 2026 — Coach: John Smith"
}
```

---

## 5. Invoice Review & Approval

### Invoice detail page: `/app/(dashboard)/ops/invoicing/outbound/[id]/page.tsx`

**Layout:**
- Header: centre name, primary contact, billing period, status badge
- Line items table: date, sport, coach, attendance, rate, amount
- Total row
- Action buttons (contextual per status)

### Status transitions and actions

| Current Status | Action | New Status | Who | Side Effects |
|---------------|--------|------------|-----|-------------|
| draft | Edit line items | draft | ops | Recalculates total |
| draft | Submit for Approval | pending_approval | ops | Notifies admin |
| pending_approval | Approve | approved | admin | Sets `approved_by`, `approved_at` |
| pending_approval | Reject (back to draft) | draft | admin | Notifies ops, stores rejection reason in `activity_log` metadata |
| approved | Send to QuickBooks | sent | ops/admin | Creates QB invoice, sets `qb_invoice_id`, `sent_at` |
| sent | Payment synced | paid | system | Via manual sync |

### Editing

- Ops can adjust individual line item amounts and descriptions on draft invoices
- Removing/adding line items is supported
- Total auto-recalculates on any change
- Save changes persists to DB without status change

---

## 6. Push to QuickBooks

### "Send to QuickBooks" action (on approved invoices)

1. Validate prerequisites:
   - QB connection active (token exists and refreshable)
   - Centre has `qb_customer_id` (if not, show error: "Sync this centre to QuickBooks first")
2. Build QB Invoice payload:
   - `CustomerRef`: `{ value: centre.qb_customer_id }`
   - `Line` items: one `SalesItemLineDetail` per line item
     - `ItemRef`: `{ value: QB_DEFAULT_ITEM_ID }` — references a "Coaching Services" item that must be pre-created in QuickBooks. The item ID is stored in the `QB_DEFAULT_ITEM_ID` env var.
     - Description: `"{Sport} coaching — {formatted date} — Coach: {coach_name}"`
     - Amount: line item amount
   - `DueDate`: invoice date + 14 days
   - `DocNumber`: BAK invoice number
3. `POST /v3/company/{realmId}/invoice` to create the invoice
4. On success:
   - Store returned QB invoice `Id` in `outbound_invoices.qb_invoice_id`
   - Update status to `sent`, set `sent_at`
   - Log to `activity_log`
5. On failure:
   - Show error message with QB error details
   - Keep status as `approved`
   - Allow retry

---

## 7. Payment Status Sync

### "Sync Payment Status" button on outbound invoices list

1. Fetch all `outbound_invoices` with status `sent` and non-null `qb_invoice_id`
2. For each, query QB: `GET /v3/company/{realmId}/invoice/{qbInvoiceId}`
3. Check the `Balance` field:
   - If `Balance === 0`: update status to `paid`
   - Otherwise: no change
4. Show summary: "X of Y invoices marked as paid"
5. Log sync action to `activity_log`

No webhook implementation — manual sync is sufficient for ~40 centres. Can be revisited if volume grows.

---

## 8. Invoice List Views

### Ops view (`/ops/invoicing/outbound`)

- Table columns: invoice number, centre name, period, amount, status, sent date
- Filters: centre (dropdown), status (multi-select), period (date range), amount range
- Row click navigates to detail view
- "Generate Invoices" button (opens generation dialog)
- "Sync Payment Status" button (when QB connected)

### Admin view (`/admin/invoicing/outbound`)

- Same table as ops view
- Additional: approval queue section at top showing `pending_approval` invoices
- Bulk approve option for multiple invoices

### Centre history

- On centre detail page, an "Invoices" tab showing all outbound invoices for that centre
- Same table format, filtered to that centre

---

## 9. File Structure

```
/lib/quickbooks/
  client.ts              — intuit-oauth setup, token read/refresh, getQuickBooksClient()
  api.ts                 — REST wrappers: createCustomer, updateCustomer, createInvoice, getInvoice
  actions.ts             — Server actions: connect URL, disconnect, syncCustomer, syncAllCustomers,
                           pushInvoiceToQB, syncPaymentStatuses

/lib/outbound-invoicing/
  actions.ts             — Server actions: calculateOutboundInvoices, generateOutboundInvoices,
                           updateLineItems, submitForApproval, approveInvoice, rejectInvoice,
                           getOutboundInvoices, getOutboundInvoiceDetail
  utils.ts               — calculateCentreAmount (per pricing model), generateOutboundInvoiceNumber

/app/api/integrations/quickbooks/
  callback/route.ts      — OAuth callback: exchange code, store tokens, redirect

/app/(dashboard)/admin/settings/integrations/
  page.tsx               — QB connection status + connect/disconnect UI

/app/(dashboard)/ops/invoicing/outbound/
  page.tsx               — Invoice list + generation dialog + payment sync
  [id]/page.tsx          — Invoice detail, editing, approval, QB push

/app/(dashboard)/admin/invoicing/outbound/
  page.tsx               — Admin invoice list with approval queue

/components/outbound-invoicing/
  generate-invoices-dialog.tsx   — Period picker, preview table, generate button
  invoice-detail.tsx             — Line items display, editing, total calculation
  invoice-list.tsx               — Filterable/sortable invoice table
  approval-queue.tsx             — Admin pending approval list
  qb-connection-status.tsx       — Connection indicator (connected/disconnected badge)
  customer-sync-button.tsx       — Per-centre sync + bulk sync buttons
  payment-sync-button.tsx        — Sync payment status button with results dialog

/supabase/migrations/
  013_quickbooks_integration.sql — integration_tokens table, centres.qb_customer_id,
                                   outbound_invoices.invoice_number, RLS policies, indexes
```

---

## 10. Error Handling

| Scenario | Behaviour |
|----------|-----------|
| QB token expired and refresh fails | Show "QuickBooks disconnected" banner, prompt reconnect |
| QB API rate limit (throttled) | Retry with exponential backoff (max 3 attempts) |
| Centre missing `qb_customer_id` on invoice push | Block push, show "Sync centre first" message |
| QB API returns validation error | Display QB error message, keep invoice status unchanged |
| Network failure during bulk sync | Continue with remaining items, report failures at end |
| Duplicate invoice number in QB | Catch error, increment sequence, retry once |

---

## 11. Activity Logging

All significant actions logged to `activity_log`:

| Action | Entity Type | Metadata |
|--------|------------|----------|
| `qb_connected` | integration | provider, company_name, realm_id |
| `qb_disconnected` | integration | provider |
| `centre_synced_to_qb` | centre | qb_customer_id |
| `centres_bulk_synced_to_qb` | centre | synced_count, failed_count |
| `outbound_invoices_generated` | outbound_invoice | period, count, total_amount |
| `outbound_invoice_submitted` | outbound_invoice | invoice_number, centre_name |
| `outbound_invoice_approved` | outbound_invoice | invoice_number, approved_by |
| `outbound_invoice_rejected` | outbound_invoice | invoice_number, reason |
| `outbound_invoice_pushed_to_qb` | outbound_invoice | invoice_number, qb_invoice_id |
| `outbound_payment_status_synced` | outbound_invoice | checked_count, paid_count |

---

## 12. Dependencies

### New npm package

- `intuit-oauth` (^4.x) — Official Intuit OAuth 2.0 client for token management. Supports Node 18+ (Vercel runtime compatible).

### Environment variables to add

- `QB_CLIENT_ID`
- `QB_CLIENT_SECRET`
- `QB_REDIRECT_URI`
- `QB_ENVIRONMENT` (`sandbox` | `production`)
- `QB_TOKEN_ENCRYPTION_KEY` (32-byte hex string for AES-256-GCM)
- `QB_DEFAULT_ITEM_ID` (QuickBooks Item ID for "Coaching Services")

---

## 13. GST Handling

GST on outbound invoices is **out of scope for this phase**. The current outbound invoice amounts are the gross amounts charged to centres. If BAK is GST-registered and needs to show GST on invoices to centres, this can be added as a follow-up:
- Add `gst_amount decimal(10,2)` to `outbound_invoices`
- Calculate 10% GST on the total
- Map to QB `TaxCodeRef` when pushing invoices

For now, invoices are pushed to QuickBooks without tax codes — the accountant can configure tax settings within QuickBooks directly.

---

## 14. File Structure for `lib/quickbooks/crypto.ts`

Encryption helper for token storage:

```typescript
// lib/quickbooks/crypto.ts
// encrypt(plaintext: string): string — returns base64-encoded IV + ciphertext
// decrypt(encrypted: string): string — decrypts back to plaintext
// Uses AES-256-GCM with QB_TOKEN_ENCRYPTION_KEY from env
```
