# QuickBooks Outbound Invoicing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate QuickBooks Online for outbound invoicing — OAuth connection, customer sync, invoice generation from session data, approval workflow, push to QB, and payment status sync.

**Architecture:** Next.js 14+ App Router server actions for all mutations, Supabase PostgreSQL with RLS, `intuit-oauth` for QB token management, direct REST calls for QB API operations. All tokens encrypted at rest with AES-256-GCM.

**Tech Stack:** Next.js 14+, TypeScript, Supabase, intuit-oauth, Tailwind CSS, shadcn/ui, Lucide React

**Spec:** `docs/superpowers/specs/2026-03-13-quickbooks-outbound-invoicing-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/013_quickbooks_integration.sql` | DB schema: integration_tokens table, centres.qb_customer_id, outbound_invoices columns, invoice number function, RLS |
| `lib/quickbooks/crypto.ts` | AES-256-GCM encrypt/decrypt helpers for token storage |
| `lib/quickbooks/client.ts` | intuit-oauth setup, token read/refresh/persist, `getQuickBooksClient()` |
| `lib/quickbooks/api.ts` | QB REST wrappers: createCustomer, updateCustomer, createInvoice, getInvoice |
| `lib/quickbooks/actions.ts` | Server actions: getConnectionStatus, getConnectUrl, disconnect, syncCustomer, syncAllCustomers, pushInvoiceToQB, syncPaymentStatuses |
| `lib/outbound-invoicing/actions.ts` | Server actions: calculateOutboundInvoices, generateOutboundInvoices, getOutboundInvoices, getOutboundInvoiceDetail, updateOutboundLineItems, submitForApproval, approveInvoice, rejectInvoice |
| `lib/outbound-invoicing/utils.ts` | calculateCentreAmount (per pricing model) |
| `app/api/integrations/quickbooks/callback/route.ts` | OAuth callback handler |
| `app/(dashboard)/admin/settings/integrations/page.tsx` | QB connection settings page |
| `app/(dashboard)/ops/invoicing/outbound/page.tsx` | Outbound invoice list + generation |
| `app/(dashboard)/ops/invoicing/outbound/[id]/page.tsx` | Invoice detail view |
| `app/(dashboard)/admin/invoicing/outbound/page.tsx` | Admin invoice list + approval queue |
| `components/outbound-invoicing/generate-invoices-dialog.tsx` | Period picker, preview, generate |
| `components/outbound-invoicing/invoice-detail.tsx` | Line items display, editing, actions |
| `components/outbound-invoicing/invoice-list.tsx` | Filterable invoice table |
| `components/outbound-invoicing/approval-queue.tsx` | Admin pending approval list |
| `components/outbound-invoicing/qb-connection-status.tsx` | Connected/disconnected badge |
| `components/outbound-invoicing/customer-sync-button.tsx` | Per-centre + bulk sync buttons |
| `components/outbound-invoicing/payment-sync-button.tsx` | Sync payment status button |

### Modified Files

| File | Changes |
|------|---------|
| `lib/types/database.ts` | Add IntegrationToken, OutboundLineItem interfaces; update OutboundInvoice and Centre |
| `lib/types/enums.ts` | No changes needed (OutboundInvoiceStatus already exists) |
| `.env.local.example` | Add QB_* env vars |

---

## Chunk 1: Database Migration, Types, and Crypto

### Task 1: Install intuit-oauth

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npm install intuit-oauth
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('intuit-oauth'); console.log('intuit-oauth loaded')"
```

Expected: `intuit-oauth loaded`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add intuit-oauth dependency for QuickBooks integration"
```

---

### Task 2: Database migration

**Files:**
- Create: `supabase/migrations/013_quickbooks_integration.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 013_quickbooks_integration.sql
-- QuickBooks Online integration: tokens, centre QB mapping, outbound invoice enhancements

-- ========================
-- integration_tokens table
-- ========================
CREATE TABLE integration_tokens (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                varchar(50) NOT NULL,
  access_token_encrypted  text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  realm_id                varchar(100),
  token_expiry            timestamptz NOT NULL,
  company_name            text,
  connected_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  connected_at            timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER integration_tokens_updated_at
  BEFORE UPDATE ON integration_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: admin-only
ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_integration_tokens" ON integration_tokens
  FOR ALL USING (auth_user_role() = 'admin');

-- Unique constraint: one connection per provider
CREATE UNIQUE INDEX idx_integration_tokens_provider ON integration_tokens(provider);

-- ========================
-- centres: add qb_customer_id
-- ========================
ALTER TABLE centres ADD COLUMN qb_customer_id varchar(100);

-- ========================
-- outbound_invoices: add invoice_number and created_by
-- ========================
ALTER TABLE outbound_invoices ADD COLUMN invoice_number varchar(50);
ALTER TABLE outbound_invoices ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE outbound_invoices ADD CONSTRAINT outbound_invoices_invoice_number_unique UNIQUE (invoice_number);

-- ========================
-- Atomic invoice number generation function
-- ========================
CREATE OR REPLACE FUNCTION next_outbound_invoice_number(year_month text)
RETURNS text AS $$
DECLARE
  next_seq int;
  inv_number text;
BEGIN
  -- Advisory lock prevents concurrent calls from generating duplicate numbers
  PERFORM pg_advisory_xact_lock(hashtext('outbound_inv_' || year_month));

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS int)
  ), 0) + 1
  INTO next_seq
  FROM outbound_invoices
  WHERE invoice_number LIKE 'BAK-OUT-' || year_month || '-%';

  inv_number := 'BAK-OUT-' || year_month || '-' || LPAD(next_seq::text, 3, '0');
  RETURN inv_number;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Verify migration syntax**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx supabase db reset --dry-run 2>&1 | tail -5
```

If `supabase db reset` is not available locally, visually verify the SQL is correct.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/013_quickbooks_integration.sql
git commit -m "feat: add migration 013 for QuickBooks integration schema"
```

---

### Task 3: Update TypeScript types

**Files:**
- Modify: `lib/types/database.ts`

- [ ] **Step 1: Add OutboundLineItem interface**

Insert after line 377 (after the closing `}` of `OutboundInvoice`):

```typescript
export interface OutboundLineItem {
  session_id: string;
  date: string;
  sport: string;
  coach_name: string;
  headcount: number | null;
  rate: number;
  amount: number;
  description: string;
}
```

- [ ] **Step 2: Update OutboundInvoice interface**

Replace the existing `OutboundInvoice` interface (lines 363-377) with:

```typescript
export interface OutboundInvoice {
  id: string;
  centre_id: string;
  period_start: string;
  period_end: string;
  line_items_json: OutboundLineItem[];
  amount: number;
  status: OutboundInvoiceStatus;
  qb_invoice_id: string | null;
  invoice_number: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Update Centre interface**

Add `qb_customer_id` to the Centre interface (after `updated_at` on line 122):

```typescript
  qb_customer_id: string | null;
```

- [ ] **Step 4: Add IntegrationToken interface**

Insert at the end of the file (before or after the last interface):

```typescript
// ========================
// Integration Tokens
// ========================
export interface IntegrationToken {
  id: string;
  provider: string;
  realm_id: string | null;
  token_expiry: string;
  company_name: string | null;
  connected_by: string | null;
  connected_at: string;
  updated_at: string;
}
```

Note: `access_token_encrypted` and `refresh_token_encrypted` are intentionally omitted from the interface — they are only handled in `lib/quickbooks/client.ts` and never exposed to components.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors (pre-existing errors are fine)

- [ ] **Step 6: Commit**

```bash
git add lib/types/database.ts
git commit -m "feat: add IntegrationToken, OutboundLineItem types; update OutboundInvoice and Centre"
```

---

### Task 4: Token encryption helpers

**Files:**
- Create: `lib/quickbooks/crypto.ts`

- [ ] **Step 1: Write the encryption module**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.QB_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("QB_TOKEN_ENCRYPTION_KEY environment variable is not set.");
  }
  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== 32) {
    throw new Error(
      "QB_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)."
    );
  }
  return keyBuffer;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns base64-encoded string: IV (12 bytes) + ciphertext + auth tag (16 bytes).
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Concatenate: IV + encrypted + authTag
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString("base64");
}

/**
 * Decrypt a base64-encoded string that was encrypted with `encrypt()`.
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(
    IV_LENGTH,
    combined.length - AUTH_TAG_LENGTH
  );

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit lib/quickbooks/crypto.ts 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add lib/quickbooks/crypto.ts
git commit -m "feat: add AES-256-GCM encryption helpers for QB token storage"
```

---

### Task 5: Update .env.local.example

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Add QB environment variables**

Append to the end of `.env.local.example`:

```bash
# QuickBooks Online Integration
QB_CLIENT_ID=
QB_CLIENT_SECRET=
QB_REDIRECT_URI=http://localhost:3000/api/integrations/quickbooks/callback
QB_ENVIRONMENT=sandbox
QB_TOKEN_ENCRYPTION_KEY=
QB_DEFAULT_ITEM_ID=
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "chore: add QuickBooks env vars to .env.local.example"
```

---

## Chunk 2: QuickBooks Client, API Layer, and OAuth

### Task 6: intuit-oauth type declaration and QuickBooks client

**Files:**
- Create: `lib/quickbooks/intuit-oauth.d.ts`
- Create: `lib/quickbooks/client.ts`

- [ ] **Step 0: Write the intuit-oauth type declaration**

`intuit-oauth` has no `@types` package. Create a type declaration:

```typescript
// lib/quickbooks/intuit-oauth.d.ts
declare module "intuit-oauth" {
  interface OAuthClientOptions {
    clientId: string;
    clientSecret: string;
    environment: "sandbox" | "production";
    redirectUri: string;
  }

  interface AuthorizeUriOptions {
    scope: string[];
    state: string;
  }

  interface TokenResponse {
    getJson(): {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };
  }

  class OAuthClient {
    static scopes: { Accounting: string };
    constructor(options: OAuthClientOptions);
    authorizeUri(options: AuthorizeUriOptions): string;
    createToken(url: string): Promise<TokenResponse>;
    refresh(): Promise<TokenResponse>;
    setToken(token: {
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
    }): void;
  }

  export default OAuthClient;
}
```

- [ ] **Step 1: Write the client module**

```typescript
import "server-only";

import OAuthClient from "intuit-oauth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "./crypto";

const QB_BASE_URL =
  process.env.QB_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

export interface QBClient {
  accessToken: string;
  realmId: string;
  baseUrl: string;
}

function createOAuthClient(): OAuthClient {
  return new OAuthClient({
    clientId: process.env.QB_CLIENT_ID!,
    clientSecret: process.env.QB_CLIENT_SECRET!,
    environment:
      process.env.QB_ENVIRONMENT === "production" ? "production" : "sandbox",
    redirectUri: process.env.QB_REDIRECT_URI!,
  });
}

/**
 * Get the authorisation URL to redirect the user to QuickBooks for OAuth consent.
 */
export function getAuthorizationUrl(state: string): string {
  const oauthClient = createOAuthClient();
  return oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });
}

/**
 * Exchange an authorisation code for tokens and persist them.
 */
export async function exchangeCodeForTokens(
  url: string,
  userId: string
): Promise<{ realmId: string; companyName: string }> {
  const oauthClient = createOAuthClient();
  const authResponse = await oauthClient.createToken(url);
  const token = authResponse.getJson();

  const realmId = new URL(url, "http://localhost").searchParams.get("realmId");
  if (!realmId) throw new Error("No realmId in callback URL.");

  // Fetch company name
  const companyInfoUrl = `${QB_BASE_URL}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`;
  const companyResponse = await fetch(companyInfoUrl, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const companyData = await companyResponse.json();
  const companyName =
    companyData?.CompanyInfo?.CompanyName ?? "Unknown Company";

  // Encrypt and store tokens
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("integration_tokens").upsert(
    {
      provider: "quickbooks",
      access_token_encrypted: encrypt(token.access_token),
      refresh_token_encrypted: encrypt(token.refresh_token),
      realm_id: realmId,
      token_expiry: new Date(
        Date.now() + token.expires_in * 1000
      ).toISOString(),
      company_name: companyName,
      connected_by: userId,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "provider" }
  );

  if (error) throw new Error(`Failed to store tokens: ${error.message}`);

  return { realmId, companyName };
}

/**
 * Get an authenticated QB client, auto-refreshing the token if needed.
 * Throws if not connected or refresh fails.
 */
export async function getQuickBooksClient(): Promise<QBClient> {
  const admin = createSupabaseAdmin();
  const { data: row, error } = await admin
    .from("integration_tokens")
    .select("*")
    .eq("provider", "quickbooks")
    .single();

  if (error || !row) {
    throw new Error("QuickBooks is not connected.");
  }

  const tokenExpiry = new Date(row.token_expiry);
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

  let accessToken: string;

  if (tokenExpiry <= fiveMinutesFromNow) {
    // Token expired or expiring soon — refresh
    const oauthClient = createOAuthClient();
    oauthClient.setToken({
      access_token: decrypt(row.access_token_encrypted),
      refresh_token: decrypt(row.refresh_token_encrypted),
      token_type: "bearer",
      expires_in: 0,
    });

    const refreshResponse = await oauthClient.refresh();
    const newToken = refreshResponse.getJson();

    accessToken = newToken.access_token;

    // Update stored tokens
    const { error: updateError } = await admin
      .from("integration_tokens")
      .update({
        access_token_encrypted: encrypt(newToken.access_token),
        refresh_token_encrypted: encrypt(newToken.refresh_token),
        token_expiry: new Date(
          Date.now() + newToken.expires_in * 1000
        ).toISOString(),
      })
      .eq("provider", "quickbooks");

    if (updateError) {
      console.error("Failed to update refreshed tokens:", updateError);
    }
  } else {
    accessToken = decrypt(row.access_token_encrypted);
  }

  return {
    accessToken,
    realmId: row.realm_id!,
    baseUrl: QB_BASE_URL,
  };
}

/**
 * Check if QuickBooks is currently connected.
 */
export async function isQuickBooksConnected(): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("integration_tokens")
    .select("id")
    .eq("provider", "quickbooks")
    .single();
  return !!data;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit 2>&1 | grep "quickbooks/client" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/quickbooks/intuit-oauth.d.ts lib/quickbooks/client.ts
git commit -m "feat: add QuickBooks OAuth client with token management and auto-refresh"
```

---

### Task 7: QuickBooks REST API wrappers

**Files:**
- Create: `lib/quickbooks/api.ts`

- [ ] **Step 1: Write the API module**

```typescript
import "server-only";

import type { QBClient } from "./client";
import type { OutboundLineItem } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

interface QBCustomerPayload {
  DisplayName: string;
  CompanyName: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: { Line1: string };
}

interface QBInvoicePayload {
  CustomerRef: { value: string };
  Line: QBInvoiceLine[];
  DueDate: string;
  DocNumber: string;
}

interface QBInvoiceLine {
  DetailType: "SalesItemLineDetail";
  Amount: number;
  Description: string;
  SalesItemLineDetail: {
    ItemRef: { value: string };
    Qty: number;
    UnitPrice: number;
  };
}

// ============================================================
// Helpers
// ============================================================

const MINOR_VERSION = "65";

async function qbFetch(
  client: QBClient,
  path: string,
  options?: RequestInit,
  retries = 3
): Promise<Response> {
  const url = `${client.baseUrl}/v3/company/${client.realmId}${path}?minorversion=${MINOR_VERSION}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${client.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    // Retry on rate limit (429) with exponential backoff
    if (response.status === 429 && attempt < retries) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `QuickBooks API error (${response.status}): ${body}`
      );
    }

    return response;
  }

  throw new Error("QuickBooks API: max retries exceeded.");
}

// ============================================================
// Customer Operations
// ============================================================

export async function createCustomer(
  client: QBClient,
  payload: QBCustomerPayload
): Promise<string> {
  const response = await qbFetch(client, "/customer", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  return data.Customer.Id as string;
}

export async function updateCustomer(
  client: QBClient,
  customerId: string,
  payload: Partial<QBCustomerPayload>
): Promise<void> {
  // Fetch current SyncToken first (required for QB updates)
  const getResponse = await qbFetch(client, `/customer/${customerId}`);
  const currentData = await getResponse.json();
  const syncToken = currentData.Customer.SyncToken;

  await qbFetch(client, "/customer", {
    method: "POST",
    body: JSON.stringify({
      Id: customerId,
      SyncToken: syncToken,
      sparse: true,
      ...payload,
    }),
  });
}

// ============================================================
// Invoice Operations
// ============================================================

export function buildInvoicePayload(
  qbCustomerId: string,
  invoiceNumber: string,
  lineItems: OutboundLineItem[],
  dueDate: string
): QBInvoicePayload {
  const itemId = process.env.QB_DEFAULT_ITEM_ID;
  if (!itemId) {
    throw new Error("QB_DEFAULT_ITEM_ID environment variable is not set.");
  }

  return {
    CustomerRef: { value: qbCustomerId },
    DocNumber: invoiceNumber,
    DueDate: dueDate,
    Line: lineItems.map((item) => ({
      DetailType: "SalesItemLineDetail" as const,
      Amount: item.amount,
      Description: item.description,
      SalesItemLineDetail: {
        ItemRef: { value: itemId },
        Qty: 1,
        UnitPrice: item.amount,
      },
    })),
  };
}

export async function createInvoice(
  client: QBClient,
  payload: QBInvoicePayload
): Promise<string> {
  const response = await qbFetch(client, "/invoice", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  return data.Invoice.Id as string;
}

export async function getInvoice(
  client: QBClient,
  invoiceId: string
): Promise<{ Id: string; Balance: number; TotalAmt: number }> {
  const response = await qbFetch(client, `/invoice/${invoiceId}`);
  const data = await response.json();
  return {
    Id: data.Invoice.Id,
    Balance: data.Invoice.Balance,
    TotalAmt: data.Invoice.TotalAmt,
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit 2>&1 | grep "quickbooks/api" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/quickbooks/api.ts
git commit -m "feat: add QuickBooks REST API wrappers for customers and invoices"
```

---

### Task 8: OAuth callback route

**Files:**
- Create: `app/api/integrations/quickbooks/callback/route.ts`

- [ ] **Step 1: Write the callback route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { exchangeCodeForTokens } from "@/lib/quickbooks/client";

export async function GET(req: NextRequest) {
  try {
    // 1. Validate CSRF state
    const cookieStore = await cookies();
    const storedState = cookieStore.get("qb_oauth_state")?.value;
    const receivedState = req.nextUrl.searchParams.get("state");

    if (!storedState || storedState !== receivedState) {
      return NextResponse.redirect(
        new URL(
          "/admin/settings/integrations?error=invalid_state",
          req.nextUrl.origin
        )
      );
    }

    // Clear the state cookie
    cookieStore.delete("qb_oauth_state");

    // 2. Verify user is authenticated admin
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        new URL("/login", req.nextUrl.origin)
      );
    }

    // 3. Exchange code for tokens
    const callbackUrl = req.nextUrl.toString();
    const { realmId, companyName } = await exchangeCodeForTokens(
      callbackUrl,
      user.id
    );

    // 4. Log activity
    const admin = createSupabaseAdmin();
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "qb_connected",
      entity_type: "integration",
      metadata: {
        provider: "quickbooks",
        company_name: companyName,
        realm_id: realmId,
      },
    });

    // 5. Redirect back to settings
    return NextResponse.redirect(
      new URL(
        "/admin/settings/integrations?connected=true",
        req.nextUrl.origin
      )
    );
  } catch (err) {
    console.error("QuickBooks OAuth callback error:", err);
    return NextResponse.redirect(
      new URL(
        "/admin/settings/integrations?error=callback_failed",
        req.nextUrl.origin
      )
    );
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit 2>&1 | grep "callback" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add app/api/integrations/quickbooks/callback/route.ts
git commit -m "feat: add QuickBooks OAuth callback route handler"
```

---

### Task 9: QuickBooks server actions

**Files:**
- Create: `lib/quickbooks/actions.ts`

- [ ] **Step 1: Write the server actions**

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import {
  getAuthorizationUrl,
  getQuickBooksClient,
  isQuickBooksConnected,
} from "./client";
import {
  createCustomer,
  updateCustomer,
  createInvoice,
  getInvoice,
  buildInvoicePayload,
} from "./api";
import type { IntegrationToken, Centre } from "@/lib/types/database";

// ============================================================
// Connection Actions
// ============================================================

export async function getConnectionStatus(): Promise<{
  data: { connected: boolean; companyName: string | null; connectedAt: string | null } | null;
  error: string | null;
}> {
  try {
    const admin = createSupabaseAdmin();
    const { data: row } = await admin
      .from("integration_tokens")
      .select("company_name, connected_at")
      .eq("provider", "quickbooks")
      .single();

    if (!row) {
      return { data: { connected: false, companyName: null, connectedAt: null }, error: null };
    }

    return {
      data: {
        connected: true,
        companyName: row.company_name,
        connectedAt: row.connected_at,
      },
      error: null,
    };
  } catch (err) {
    console.error("getConnectionStatus:", err);
    return { data: null, error: "Failed to check connection status." };
  }
}

export async function getConnectUrl(): Promise<{
  data: string | null;
  error: string | null;
}> {
  try {
    const state = randomBytes(16).toString("hex");
    const cookieStore = await cookies();
    cookieStore.set("qb_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    const url = getAuthorizationUrl(state);
    return { data: url, error: null };
  } catch (err) {
    console.error("getConnectUrl:", err);
    return { data: null, error: "Failed to generate QuickBooks connect URL." };
  }
}

export async function disconnectQuickBooks(): Promise<{
  data: boolean | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    // Delete the token row
    const { error: deleteError } = await admin
      .from("integration_tokens")
      .delete()
      .eq("provider", "quickbooks");

    if (deleteError) return { data: null, error: deleteError.message };

    // Clear all qb_customer_id values (stale if reconnecting to different company)
    await admin
      .from("centres")
      .update({ qb_customer_id: null })
      .not("qb_customer_id", "is", null);

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "qb_disconnected",
      entity_type: "integration",
      metadata: { provider: "quickbooks" },
    });

    revalidatePath("/admin/settings/integrations");
    return { data: true, error: null };
  } catch (err) {
    console.error("disconnectQuickBooks:", err);
    return { data: null, error: "Failed to disconnect QuickBooks." };
  }
}

// ============================================================
// Customer Sync Actions
// ============================================================

export async function syncCentreToQuickBooks(centreId: string): Promise<{
  data: { qbCustomerId: string } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const client = await getQuickBooksClient();
    const admin = createSupabaseAdmin();

    // Fetch centre
    const { data: centre, error: centreError } = await admin
      .from("centres")
      .select("*")
      .eq("id", centreId)
      .single();

    if (centreError || !centre) {
      return { data: null, error: "Centre not found." };
    }

    const customerPayload = {
      DisplayName: centre.name,
      CompanyName: centre.name,
      ...(centre.primary_contact_email && {
        PrimaryEmailAddr: { Address: centre.primary_contact_email },
      }),
      ...(centre.primary_contact_phone && {
        PrimaryPhone: { FreeFormNumber: centre.primary_contact_phone },
      }),
      ...(centre.address && {
        BillAddr: { Line1: centre.address },
      }),
    };

    let qbCustomerId: string;

    if (centre.qb_customer_id) {
      // Update existing customer
      await updateCustomer(client, centre.qb_customer_id, customerPayload);
      qbCustomerId = centre.qb_customer_id;
    } else {
      // Create new customer
      qbCustomerId = await createCustomer(client, customerPayload);

      // Store qb_customer_id on centre
      await admin
        .from("centres")
        .update({ qb_customer_id: qbCustomerId })
        .eq("id", centreId);
    }

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "centre_synced_to_qb",
      entity_type: "centre",
      entity_id: centreId,
      metadata: { qb_customer_id: qbCustomerId },
    });

    revalidatePath("/admin/settings/integrations");
    return { data: { qbCustomerId }, error: null };
  } catch (err) {
    console.error("syncCentreToQuickBooks:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to sync centre.",
    };
  }
}

export async function syncAllCentresToQuickBooks(): Promise<{
  data: { synced: number; failed: { centreId: string; name: string; error: string }[] } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const client = await getQuickBooksClient();
    const admin = createSupabaseAdmin();

    const { data: centres, error: centresError } = await admin
      .from("centres")
      .select("*")
      .in("contract_status", ["active", "trial"]);

    if (centresError || !centres) {
      return { data: null, error: "Failed to fetch centres." };
    }

    let synced = 0;
    const failed: { centreId: string; name: string; error: string }[] = [];

    for (const centre of centres) {
      try {
        const customerPayload = {
          DisplayName: centre.name,
          CompanyName: centre.name,
          ...(centre.primary_contact_email && {
            PrimaryEmailAddr: { Address: centre.primary_contact_email },
          }),
          ...(centre.primary_contact_phone && {
            PrimaryPhone: { FreeFormNumber: centre.primary_contact_phone },
          }),
          ...(centre.address && {
            BillAddr: { Line1: centre.address },
          }),
        };

        let qbCustomerId: string;

        if (centre.qb_customer_id) {
          await updateCustomer(client, centre.qb_customer_id, customerPayload);
          qbCustomerId = centre.qb_customer_id;
        } else {
          qbCustomerId = await createCustomer(client, customerPayload);
          await admin
            .from("centres")
            .update({ qb_customer_id: qbCustomerId })
            .eq("id", centre.id);
        }

        synced++;

        // 200ms delay between API calls to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (err) {
        failed.push({
          centreId: centre.id,
          name: centre.name,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // Log bulk action
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "centres_bulk_synced_to_qb",
      entity_type: "centre",
      metadata: { synced_count: synced, failed_count: failed.length },
    });

    revalidatePath("/admin/settings/integrations");
    return { data: { synced, failed }, error: null };
  } catch (err) {
    console.error("syncAllCentresToQuickBooks:", err);
    return { data: null, error: "Failed to bulk sync centres." };
  }
}

// ============================================================
// Invoice Push Actions
// ============================================================

export async function pushInvoiceToQuickBooks(invoiceId: string): Promise<{
  data: { qbInvoiceId: string } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const client = await getQuickBooksClient();
    const admin = createSupabaseAdmin();

    // Fetch the invoice with centre data
    const { data: invoice, error: invoiceError } = await admin
      .from("outbound_invoices")
      .select("*, centres(name, qb_customer_id)")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return { data: null, error: "Invoice not found." };
    }

    if (invoice.status !== "approved") {
      return { data: null, error: "Invoice must be approved before sending to QuickBooks." };
    }

    const centre = invoice.centres as unknown as { name: string; qb_customer_id: string | null };
    if (!centre?.qb_customer_id) {
      return {
        data: null,
        error: "This centre has not been synced to QuickBooks. Please sync the centre first.",
      };
    }

    // Build and send invoice to QB
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
    const dueDateStr = dueDate.toISOString().split("T")[0];

    const payload = buildInvoicePayload(
      centre.qb_customer_id,
      invoice.invoice_number!,
      invoice.line_items_json as unknown as import("@/lib/types/database").OutboundLineItem[],
      dueDateStr
    );

    const qbInvoiceId = await createInvoice(client, payload);

    // Update invoice record
    const { error: updateError } = await admin
      .from("outbound_invoices")
      .update({
        qb_invoice_id: qbInvoiceId,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (updateError) {
      return { data: null, error: `QB invoice created but failed to update record: ${updateError.message}` };
    }

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoice_pushed_to_qb",
      entity_type: "outbound_invoice",
      entity_id: invoiceId,
      metadata: {
        invoice_number: invoice.invoice_number,
        qb_invoice_id: qbInvoiceId,
      },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    return { data: { qbInvoiceId }, error: null };
  } catch (err) {
    console.error("pushInvoiceToQuickBooks:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to push invoice to QuickBooks.",
    };
  }
}

export async function syncPaymentStatuses(): Promise<{
  data: { checked: number; paid: number } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const client = await getQuickBooksClient();
    const admin = createSupabaseAdmin();

    // Fetch all sent invoices with QB IDs
    const { data: invoices, error: invoicesError } = await admin
      .from("outbound_invoices")
      .select("id, qb_invoice_id, invoice_number")
      .eq("status", "sent")
      .not("qb_invoice_id", "is", null);

    if (invoicesError || !invoices) {
      return { data: null, error: "Failed to fetch sent invoices." };
    }

    let paid = 0;

    for (const invoice of invoices) {
      try {
        const qbInvoice = await getInvoice(client, invoice.qb_invoice_id!);

        if (qbInvoice.Balance === 0) {
          await admin
            .from("outbound_invoices")
            .update({ status: "paid" })
            .eq("id", invoice.id);
          paid++;
        }

        // 200ms delay between API calls
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (err) {
        console.error(
          `Failed to check payment for invoice ${invoice.invoice_number}:`,
          err
        );
      }
    }

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_payment_status_synced",
      entity_type: "outbound_invoice",
      metadata: { checked_count: invoices.length, paid_count: paid },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    return { data: { checked: invoices.length, paid }, error: null };
  } catch (err) {
    console.error("syncPaymentStatuses:", err);
    return { data: null, error: "Failed to sync payment statuses." };
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit 2>&1 | grep "quickbooks/actions" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/quickbooks/actions.ts
git commit -m "feat: add QuickBooks server actions for connection, customer sync, and invoice push"
```

---

## Chunk 3: Outbound Invoice Generation and Approval Actions

### Task 10: Outbound invoicing utility functions

**Files:**
- Create: `lib/outbound-invoicing/utils.ts`

- [ ] **Step 1: Write the utility module**

```typescript
import type { Centre } from "@/lib/types/database";

const PARENT_FUNDED_RATE = 10; // $10 per child per session
const PER_HEAD_RATE = 5; // $5 per child per session (schools)

/**
 * Calculate the invoice amount for a single session based on the centre's pricing model.
 */
export function calculateSessionAmount(
  pricingModel: Centre["pricing_model"],
  agreedRate: number | null,
  headcount: number | null
): number {
  switch (pricingModel) {
    case "centre_funded":
      return agreedRate ?? 0;
    case "parent_funded":
      return (headcount ?? 0) * PARENT_FUNDED_RATE;
    case "per_head":
      return (headcount ?? 0) * PER_HEAD_RATE;
    default:
      return 0;
  }
}

/**
 * Get the rate label for display purposes.
 */
export function getRateLabel(
  pricingModel: Centre["pricing_model"],
  agreedRate: number | null
): string {
  switch (pricingModel) {
    case "centre_funded":
      return `$${(agreedRate ?? 0).toFixed(2)}/session`;
    case "parent_funded":
      return `$${PARENT_FUNDED_RATE}/child`;
    case "per_head":
      return `$${PER_HEAD_RATE}/child`;
    default:
      return "N/A";
  }
}

/**
 * Generate the next outbound invoice number via the PostgreSQL function.
 * Must be called within a server context (uses Supabase admin client).
 */
export async function generateOutboundInvoiceNumber(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createSupabaseAdmin>,
  yearMonth: string
): Promise<string> {
  const { data, error } = await admin.rpc("next_outbound_invoice_number", {
    year_month: yearMonth,
  });
  if (error) throw new Error(`Failed to generate invoice number: ${error.message}`);
  return data as string;
}

/**
 * Format a date string to Australian display format: "15 Mar 2026"
 */
export function formatOutboundDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/outbound-invoicing/utils.ts
git commit -m "feat: add outbound invoicing utility functions for amount calculation"
```

---

### Task 11: Outbound invoicing server actions

**Files:**
- Create: `lib/outbound-invoicing/actions.ts`

- [ ] **Step 1: Write the server actions**

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { triggerNotificationForOps } from "@/lib/notifications/send";
import type {
  OutboundInvoice,
  OutboundLineItem,
  Centre,
} from "@/lib/types/database";
import { calculateSessionAmount, formatOutboundDate } from "./utils";

// ============================================================
// Types
// ============================================================

export interface OutboundInvoicePreview {
  centreId: string;
  centreName: string;
  pricingModel: Centre["pricing_model"];
  sessionCount: number;
  totalAmount: number;
  lineItems: OutboundLineItem[];
}

export interface OutboundInvoiceWithCentre extends OutboundInvoice {
  centre_name: string;
  centre_primary_contact_email: string | null;
}

// ============================================================
// Read Actions
// ============================================================

export async function getOutboundInvoices(filters?: {
  centreId?: string;
  status?: string[];
  periodStart?: string;
  periodEnd?: string;
}): Promise<{ data: OutboundInvoiceWithCentre[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    let query = supabase
      .from("outbound_invoices")
      .select("*, centres(name, primary_contact_email)")
      .order("created_at", { ascending: false });

    if (filters?.centreId) {
      query = query.eq("centre_id", filters.centreId);
    }
    if (filters?.status && filters.status.length > 0) {
      query = query.in("status", filters.status);
    }
    if (filters?.periodStart) {
      query = query.gte("period_start", filters.periodStart);
    }
    if (filters?.periodEnd) {
      query = query.lte("period_end", filters.periodEnd);
    }

    const { data, error } = await query;
    if (error) return { data: null, error: error.message };

    const invoices = (data ?? []).map((row: Record<string, unknown>) => {
      const centre = row.centres as { name: string; primary_contact_email: string | null } | null;
      return {
        ...row,
        centre_name: centre?.name ?? "Unknown",
        centre_primary_contact_email: centre?.primary_contact_email ?? null,
        centres: undefined,
      } as OutboundInvoiceWithCentre;
    });

    return { data: invoices, error: null };
  } catch (err) {
    console.error("getOutboundInvoices:", err);
    return { data: null, error: "Failed to fetch outbound invoices." };
  }
}

export async function getOutboundInvoiceDetail(invoiceId: string): Promise<{
  data: (OutboundInvoiceWithCentre & { centre: Centre }) | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("outbound_invoices")
      .select("*, centres(*)")
      .eq("id", invoiceId)
      .single();

    if (error) return { data: null, error: error.message };

    const centre = data.centres as unknown as Centre;
    return {
      data: {
        ...data,
        centre_name: centre?.name ?? "Unknown",
        centre_primary_contact_email: centre?.primary_contact_email ?? null,
        centre,
        centres: undefined,
      } as OutboundInvoiceWithCentre & { centre: Centre },
      error: null,
    };
  } catch (err) {
    console.error("getOutboundInvoiceDetail:", err);
    return { data: null, error: "Failed to fetch invoice detail." };
  }
}

// ============================================================
// Generate Actions
// ============================================================

export async function calculateOutboundInvoices(
  periodStart: string,
  periodEnd: string
): Promise<{ data: OutboundInvoicePreview[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    // Fetch completed sessions in the period with centre and coach info
    const { data: sessions, error: sessionsError } = await admin
      .from("sessions")
      .select(
        "id, date, sport, headcount, centre_id, centres(id, name, pricing_model, agreed_rate), profiles!sessions_coach_id_fkey(name)"
      )
      .eq("status", "completed")
      .gte("date", periodStart)
      .lte("date", periodEnd);

    if (sessionsError) return { data: null, error: sessionsError.message };
    if (!sessions || sessions.length === 0) {
      return { data: [], error: null };
    }

    // Check for existing invoices that overlap this period
    const { data: existingInvoices } = await admin
      .from("outbound_invoices")
      .select("centre_id")
      .lte("period_start", periodEnd)
      .gte("period_end", periodStart);

    const existingCentreIds = new Set(
      (existingInvoices ?? []).map((inv: { centre_id: string }) => inv.centre_id)
    );

    // Group sessions by centre
    const centreMap = new Map<string, {
      centre: { id: string; name: string; pricing_model: string; agreed_rate: number | null };
      sessions: typeof sessions;
    }>();

    for (const session of sessions) {
      const centre = session.centres as unknown as {
        id: string;
        name: string;
        pricing_model: string;
        agreed_rate: number | null;
      };
      if (!centre) continue;

      // Skip centres with existing invoices
      if (existingCentreIds.has(centre.id)) continue;

      if (!centreMap.has(centre.id)) {
        centreMap.set(centre.id, { centre, sessions: [] });
      }
      centreMap.get(centre.id)!.sessions.push(session);
    }

    // Build previews
    const previews: OutboundInvoicePreview[] = [];

    for (const [centreId, { centre, sessions: centreSessions }] of centreMap) {
      const lineItems: OutboundLineItem[] = centreSessions.map((session) => {
        const coachName =
          (session.profiles as unknown as { name: string })?.name ?? "Unknown";
        const amount = calculateSessionAmount(
          centre.pricing_model as Centre["pricing_model"],
          centre.agreed_rate,
          session.headcount
        );
        const formattedDate = formatOutboundDate(session.date);
        return {
          session_id: session.id,
          date: session.date,
          sport: session.sport,
          coach_name: coachName,
          headcount: session.headcount,
          rate: centre.pricing_model === "centre_funded"
            ? (centre.agreed_rate ?? 0)
            : centre.pricing_model === "parent_funded"
            ? 10
            : 5,
          amount,
          description: `${session.sport} coaching — ${formattedDate} — Coach: ${coachName}`,
        };
      });

      const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);

      previews.push({
        centreId,
        centreName: centre.name,
        pricingModel: centre.pricing_model as Centre["pricing_model"],
        sessionCount: centreSessions.length,
        totalAmount,
        lineItems,
      });
    }

    return { data: previews, error: null };
  } catch (err) {
    console.error("calculateOutboundInvoices:", err);
    return { data: null, error: "Failed to calculate outbound invoices." };
  }
}

export async function generateOutboundInvoices(
  periodStart: string,
  periodEnd: string,
  previews: OutboundInvoicePreview[]
): Promise<{ data: { count: number } | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();
    const yearMonth = periodStart.substring(0, 7).replace("-", "");

    const invoices = [];

    for (const preview of previews) {
      // Get next invoice number atomically
      const { data: numberResult } = await admin.rpc(
        "next_outbound_invoice_number",
        { year_month: yearMonth }
      );

      const invoiceNumber = numberResult as string;

      invoices.push({
        centre_id: preview.centreId,
        period_start: periodStart,
        period_end: periodEnd,
        line_items_json: preview.lineItems,
        amount: preview.totalAmount,
        status: "draft" as const,
        invoice_number: invoiceNumber,
        created_by: user.id,
      });
    }

    const { error: insertError } = await admin
      .from("outbound_invoices")
      .insert(invoices);

    if (insertError) return { data: null, error: insertError.message };

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoices_generated",
      entity_type: "outbound_invoice",
      metadata: {
        period: `${periodStart} to ${periodEnd}`,
        count: invoices.length,
        total_amount: invoices.reduce((sum, inv) => sum + inv.amount, 0),
      },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    return { data: { count: invoices.length }, error: null };
  } catch (err) {
    console.error("generateOutboundInvoices:", err);
    return { data: null, error: "Failed to generate outbound invoices." };
  }
}

// ============================================================
// Edit / Workflow Actions
// ============================================================

export async function updateOutboundLineItems(
  invoiceId: string,
  lineItems: OutboundLineItem[]
): Promise<{ data: boolean | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const newTotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

    const { error } = await supabase
      .from("outbound_invoices")
      .update({
        line_items_json: lineItems as unknown as Record<string, unknown>[],
        amount: newTotal,
      })
      .eq("id", invoiceId)
      .eq("status", "draft"); // Only allow editing drafts

    if (error) return { data: null, error: error.message };

    revalidatePath(`/ops/invoicing/outbound/${invoiceId}`);
    return { data: true, error: null };
  } catch (err) {
    console.error("updateOutboundLineItems:", err);
    return { data: null, error: "Failed to update line items." };
  }
}

export async function submitForApproval(invoiceId: string): Promise<{
  data: boolean | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    const { data: invoice, error: fetchError } = await admin
      .from("outbound_invoices")
      .select("invoice_number, centres(name)")
      .eq("id", invoiceId)
      .eq("status", "draft")
      .single();

    if (fetchError || !invoice) {
      return { data: null, error: "Invoice not found or not in draft status." };
    }

    const { error: updateError } = await admin
      .from("outbound_invoices")
      .update({ status: "pending_approval" })
      .eq("id", invoiceId);

    if (updateError) return { data: null, error: updateError.message };

    const centreName =
      (invoice.centres as unknown as { name: string })?.name ?? "Unknown";

    // Notify admins specifically (they approve invoices)
    const { data: admins } = await admin
      .from("profiles")
      .select("id, email, name, role")
      .eq("role", "admin")
      .eq("status", "active");

    if (admins && admins.length > 0) {
      const { triggerNotification } = await import("@/lib/notifications/send");
      await triggerNotification(
        {
          type: "invoice_status_changed",
          title: "Outbound invoice pending approval",
          body: `Invoice ${invoice.invoice_number} for ${centreName} is ready for review.`,
          entityType: "outbound_invoice",
          entityId: invoiceId,
        },
        admins.map((a) => ({ userId: a.id, email: a.email, name: a.name, role: a.role }))
      );
    }

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoice_submitted",
      entity_type: "outbound_invoice",
      entity_id: invoiceId,
      metadata: {
        invoice_number: invoice.invoice_number,
        centre_name: centreName,
      },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    return { data: true, error: null };
  } catch (err) {
    console.error("submitForApproval:", err);
    return { data: null, error: "Failed to submit invoice for approval." };
  }
}

export async function approveInvoice(invoiceId: string): Promise<{
  data: boolean | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    const { error: updateError } = await admin
      .from("outbound_invoices")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .eq("status", "pending_approval");

    if (updateError) return { data: null, error: updateError.message };

    const { data: invoice } = await admin
      .from("outbound_invoices")
      .select("invoice_number")
      .eq("id", invoiceId)
      .single();

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoice_approved",
      entity_type: "outbound_invoice",
      entity_id: invoiceId,
      metadata: {
        invoice_number: invoice?.invoice_number,
        approved_by: user.id,
      },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    return { data: true, error: null };
  } catch (err) {
    console.error("approveInvoice:", err);
    return { data: null, error: "Failed to approve invoice." };
  }
}

export async function rejectInvoice(
  invoiceId: string,
  reason: string
): Promise<{ data: boolean | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    const { error: updateError } = await admin
      .from("outbound_invoices")
      .update({ status: "draft" })
      .eq("id", invoiceId)
      .eq("status", "pending_approval");

    if (updateError) return { data: null, error: updateError.message };

    const { data: invoice } = await admin
      .from("outbound_invoices")
      .select("invoice_number, centres(name)")
      .eq("id", invoiceId)
      .single();

    const centreName =
      (invoice?.centres as unknown as { name: string })?.name ?? "Unknown";

    // Notify ops
    await triggerNotificationForOps({
      type: "invoice_status_changed",
      title: "Outbound invoice rejected",
      body: `Invoice ${invoice?.invoice_number} for ${centreName} was rejected: ${reason}`,
      entityType: "outbound_invoice",
      entityId: invoiceId,
    });

    // Log activity with rejection reason
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoice_rejected",
      entity_type: "outbound_invoice",
      entity_id: invoiceId,
      metadata: {
        invoice_number: invoice?.invoice_number,
        reason,
      },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    return { data: true, error: null };
  } catch (err) {
    console.error("rejectInvoice:", err);
    return { data: null, error: "Failed to reject invoice." };
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit 2>&1 | grep "outbound-invoicing" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/outbound-invoicing/actions.ts lib/outbound-invoicing/utils.ts
git commit -m "feat: add outbound invoicing server actions and utility functions"
```

---

## Chunk 4: UI Components and Pages

### Task 12: QB connection status component

**Files:**
- Create: `components/outbound-invoicing/qb-connection-status.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Unlink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getConnectUrl,
  disconnectQuickBooks,
} from "@/lib/quickbooks/actions";

interface Props {
  connected: boolean;
  companyName: string | null;
  connectedAt: string | null;
}

export function QBConnectionStatus({
  connected,
  companyName,
  connectedAt,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    const { data: url, error } = await getConnectUrl();
    if (error || !url) {
      toast.error(error ?? "Failed to get connect URL.");
      setLoading(false);
      return;
    }
    window.location.href = url;
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect from QuickBooks? This will clear all centre sync data.")) return;
    setLoading(true);
    const { error } = await disconnectQuickBooks();
    if (error) {
      toast.error(error);
    } else {
      toast.success("QuickBooks disconnected.");
    }
    setLoading(false);
  }

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#1A1A1A]">
            QuickBooks Online
          </h3>
          <p className="text-sm text-[#666666]">
            Connect your QuickBooks account to push outbound invoices directly.
          </p>
        </div>
        {connected ? (
          <Badge variant="default" className="bg-green-600">
            Connected
          </Badge>
        ) : (
          <Badge variant="secondary">Disconnected</Badge>
        )}
      </div>

      {connected && companyName && (
        <div className="text-sm text-[#666666]">
          <p>
            <span className="font-medium text-[#1A1A1A]">{companyName}</span>
          </p>
          {connectedAt && (
            <p>
              Connected{" "}
              {new Date(connectedAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      )}

      <div>
        {connected ? (
          <Button
            variant="destructive"
            onClick={handleDisconnect}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Unlink className="mr-2 h-4 w-4" />
            )}
            Disconnect
          </Button>
        ) : (
          <Button
            onClick={handleConnect}
            disabled={loading}
            className="bg-[#E8712A] hover:bg-[#D4631F]"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            Connect to QuickBooks
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/outbound-invoicing/qb-connection-status.tsx
git commit -m "feat: add QuickBooks connection status component"
```

---

### Task 13: Admin settings integrations page

**Files:**
- Create: `app/(dashboard)/admin/settings/integrations/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConnectionStatus } from "@/lib/quickbooks/actions";
import { QBConnectionStatus } from "@/components/outbound-invoicing/qb-connection-status";

export default async function IntegrationsSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: status } = await getConnectionStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Integrations</h1>
        <p className="text-sm text-[#666666]">
          Manage third-party integrations for invoicing and accounting.
        </p>
      </div>

      <QBConnectionStatus
        connected={status?.connected ?? false}
        companyName={status?.companyName ?? null}
        connectedAt={status?.connectedAt ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/admin/settings/integrations/page.tsx
git commit -m "feat: add admin integrations settings page with QB connection"
```

---

### Task 14: Invoice list component

**Files:**
- Create: `components/outbound-invoicing/invoice-list.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { OutboundInvoiceWithCentre } from "@/lib/outbound-invoicing/actions";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-800" },
  pending_approval: { label: "Pending Approval", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-800" },
  sent: { label: "Sent", className: "bg-purple-100 text-purple-800" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800" },
};

interface Props {
  invoices: OutboundInvoiceWithCentre[];
  basePath: string; // "/ops/invoicing/outbound" or "/admin/invoicing/outbound"
}

export function OutboundInvoiceList({ invoices, basePath }: Props) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-[#666666]">
        No outbound invoices found.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[#F5F5F5]">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-[#1A1A1A]">Invoice #</th>
            <th className="text-left px-4 py-3 font-medium text-[#1A1A1A]">Centre</th>
            <th className="text-left px-4 py-3 font-medium text-[#1A1A1A]">Period</th>
            <th className="text-right px-4 py-3 font-medium text-[#1A1A1A]">Amount</th>
            <th className="text-left px-4 py-3 font-medium text-[#1A1A1A]">Status</th>
            <th className="text-left px-4 py-3 font-medium text-[#1A1A1A]">Sent</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {invoices.map((invoice) => {
            const style = STATUS_STYLES[invoice.status] ?? STATUS_STYLES.draft;
            return (
              <tr key={invoice.id} className="hover:bg-[#F5F5F5] cursor-pointer">
                <td className="px-4 py-3">
                  <Link
                    href={`${basePath}/${invoice.id}`}
                    className="text-[#E8712A] hover:underline font-medium"
                  >
                    {invoice.invoice_number ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[#1A1A1A]">{invoice.centre_name}</td>
                <td className="px-4 py-3 text-[#666666]">
                  {new Date(invoice.period_start).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  {" — "}
                  {new Date(invoice.period_end).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                </td>
                <td className="px-4 py-3 text-right font-medium text-[#1A1A1A]">
                  ${invoice.amount.toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  <Badge className={style.className}>{style.label}</Badge>
                </td>
                <td className="px-4 py-3 text-[#666666]">
                  {invoice.sent_at
                    ? new Date(invoice.sent_at).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/outbound-invoicing/invoice-list.tsx
git commit -m "feat: add outbound invoice list component"
```

---

### Task 15: Generate invoices dialog

**Files:**
- Create: `components/outbound-invoicing/generate-invoices-dialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  calculateOutboundInvoices,
  generateOutboundInvoices,
  type OutboundInvoicePreview,
} from "@/lib/outbound-invoicing/actions";

export function GenerateInvoicesDialog() {
  const [open, setOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [previews, setPreviews] = useState<OutboundInvoicePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function handleCalculate() {
    if (!periodStart || !periodEnd) {
      toast.error("Please select a billing period.");
      return;
    }
    setLoading(true);
    const { data, error } = await calculateOutboundInvoices(periodStart, periodEnd);
    if (error) {
      toast.error(error);
    } else {
      setPreviews(data ?? []);
      if (data?.length === 0) {
        toast.info("No completed sessions found for this period.");
      }
    }
    setLoading(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    const { data, error } = await generateOutboundInvoices(periodStart, periodEnd, previews);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`${data?.count ?? 0} invoices generated.`);
      setOpen(false);
      setPreviews([]);
    }
    setGenerating(false);
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="bg-[#E8712A] hover:bg-[#D4631F]">
        <FileText className="mr-2 h-4 w-4" />
        Generate Invoices
      </Button>
    );
  }

  return (
    <div className="rounded-lg border p-6 space-y-4 bg-white">
      <h3 className="text-lg font-semibold text-[#1A1A1A]">Generate Outbound Invoices</h3>

      <div className="flex gap-4 items-end">
        <div>
          <label className="text-sm font-medium text-[#1A1A1A]">Period Start</label>
          <Input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1A1A1A]">Period End</label>
          <Input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </div>
        <Button onClick={handleCalculate} disabled={loading} variant="outline">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Calculate
        </Button>
      </div>

      {previews.length > 0 && (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F5F5]">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Centre</th>
                  <th className="text-left px-4 py-2 font-medium">Model</th>
                  <th className="text-right px-4 py-2 font-medium">Sessions</th>
                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {previews.map((p) => (
                  <tr key={p.centreId}>
                    <td className="px-4 py-2">{p.centreName}</td>
                    <td className="px-4 py-2 text-[#666666]">{p.pricingModel.replace("_", " ")}</td>
                    <td className="px-4 py-2 text-right">{p.sessionCount}</td>
                    <td className="px-4 py-2 text-right font-medium">${p.totalAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#F5F5F5]">
                <tr>
                  <td className="px-4 py-2 font-semibold" colSpan={2}>
                    Total ({previews.length} centres)
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">
                    {previews.reduce((s, p) => s + p.sessionCount, 0)}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">
                    ${previews.reduce((s, p) => s + p.totalAmount, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-[#E8712A] hover:bg-[#D4631F]"
            >
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Generate All
            </Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setPreviews([]); }}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/outbound-invoicing/generate-invoices-dialog.tsx
git commit -m "feat: add generate invoices dialog with preview and calculation"
```

---

### Task 16: Invoice detail component

**Files:**
- Create: `components/outbound-invoicing/invoice-detail.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, CheckCircle, XCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  updateOutboundLineItems,
  submitForApproval,
  approveInvoice,
  rejectInvoice,
} from "@/lib/outbound-invoicing/actions";
import { pushInvoiceToQuickBooks } from "@/lib/quickbooks/actions";
import type {
  OutboundInvoice,
  OutboundLineItem,
  Centre,
} from "@/lib/types/database";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-800" },
  pending_approval: { label: "Pending Approval", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-800" },
  sent: { label: "Sent", className: "bg-purple-100 text-purple-800" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800" },
};

interface Props {
  invoice: OutboundInvoice & { centre: Centre };
  userRole: "admin" | "ops";
  qbConnected: boolean;
}

export function InvoiceDetail({ invoice, userRole, qbConnected }: Props) {
  const [lineItems, setLineItems] = useState<OutboundLineItem[]>(
    invoice.line_items_json
  );
  const [loading, setLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const isDraft = invoice.status === "draft";
  const isPending = invoice.status === "pending_approval";
  const isApproved = invoice.status === "approved";
  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const style = STATUS_STYLES[invoice.status] ?? STATUS_STYLES.draft;

  function handleAmountChange(index: number, newAmount: string) {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], amount: parseFloat(newAmount) || 0 };
    setLineItems(updated);
  }

  function handleRemoveItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setLoading(true);
    const { error } = await updateOutboundLineItems(invoice.id, lineItems);
    if (error) toast.error(error);
    else toast.success("Line items saved.");
    setLoading(false);
  }

  async function handleSubmit() {
    setLoading(true);
    const { error } = await submitForApproval(invoice.id);
    if (error) toast.error(error);
    else toast.success("Submitted for approval.");
    setLoading(false);
  }

  async function handleApprove() {
    setLoading(true);
    const { error } = await approveInvoice(invoice.id);
    if (error) toast.error(error);
    else toast.success("Invoice approved.");
    setLoading(false);
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast.error("Please provide a reason for rejection.");
      return;
    }
    setLoading(true);
    const { error } = await rejectInvoice(invoice.id, rejectReason);
    if (error) toast.error(error);
    else toast.success("Invoice rejected and returned to draft.");
    setLoading(false);
    setShowRejectInput(false);
  }

  async function handlePushToQB() {
    if (!invoice.centre.qb_customer_id) {
      toast.error("This centre has not been synced to QuickBooks. Please sync the centre first.");
      return;
    }
    setLoading(true);
    const { error } = await pushInvoiceToQuickBooks(invoice.id);
    if (error) toast.error(error);
    else toast.success("Invoice sent to QuickBooks.");
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A1A]">
            {invoice.invoice_number ?? "Draft Invoice"}
          </h2>
          <p className="text-[#666666]">
            {invoice.centre.name} — {invoice.centre.primary_contact_email ?? "No email"}
          </p>
          <p className="text-sm text-[#666666]">
            Period:{" "}
            {new Date(invoice.period_start).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            {" — "}
            {new Date(invoice.period_end).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
        <Badge className={style.className}>{style.label}</Badge>
      </div>

      {/* Line items table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F5F5F5]">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Sport</th>
              <th className="text-left px-4 py-3 font-medium">Coach</th>
              <th className="text-right px-4 py-3 font-medium">Attendance</th>
              <th className="text-right px-4 py-3 font-medium">Rate</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              {isDraft && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {lineItems.map((item, index) => (
              <tr key={item.session_id}>
                <td className="px-4 py-3 text-[#666666]">
                  {new Date(item.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </td>
                <td className="px-4 py-3">{item.sport}</td>
                <td className="px-4 py-3">{item.coach_name}</td>
                <td className="px-4 py-3 text-right">{item.headcount ?? "—"}</td>
                <td className="px-4 py-3 text-right">${item.rate.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  {isDraft ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={item.amount}
                      onChange={(e) => handleAmountChange(index, e.target.value)}
                      className="w-24 text-right h-8"
                    />
                  ) : (
                    `$${item.amount.toFixed(2)}`
                  )}
                </td>
                {isDraft && (
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(index)}
                      className="text-red-500 hover:text-red-700 h-8"
                    >
                      ×
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[#F5F5F5]">
            <tr>
              <td colSpan={isDraft ? 5 : 5} className="px-4 py-3 font-semibold text-right">
                Total
              </td>
              <td className="px-4 py-3 text-right font-bold text-[#1A1A1A]">
                ${total.toFixed(2)}
              </td>
              {isDraft && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {isDraft && (
          <>
            <Button onClick={handleSave} variant="outline" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
            <Button onClick={handleSubmit} className="bg-[#E8712A] hover:bg-[#D4631F]" disabled={loading}>
              <Send className="mr-2 h-4 w-4" />
              Submit for Approval
            </Button>
          </>
        )}

        {isPending && userRole === "admin" && (
          <>
            <Button onClick={handleApprove} className="bg-green-600 hover:bg-green-700" disabled={loading}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
            {showRejectInput ? (
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Reason for rejection..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-64"
                />
                <Button onClick={handleReject} variant="destructive" disabled={loading}>
                  Confirm Reject
                </Button>
                <Button variant="ghost" onClick={() => setShowRejectInput(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="destructive" onClick={() => setShowRejectInput(true)}>
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            )}
          </>
        )}

        {isApproved && qbConnected && (
          <Button onClick={handlePushToQB} className="bg-[#E8712A] hover:bg-[#D4631F]" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Send to QuickBooks
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/outbound-invoicing/invoice-detail.tsx
git commit -m "feat: add invoice detail component with editing, approval, and QB push"
```

---

### Task 17: Customer sync and payment sync button components

**Files:**
- Create: `components/outbound-invoicing/customer-sync-button.tsx`
- Create: `components/outbound-invoicing/payment-sync-button.tsx`

- [ ] **Step 1: Write customer sync button**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  syncCentreToQuickBooks,
  syncAllCentresToQuickBooks,
} from "@/lib/quickbooks/actions";

export function CustomerSyncButton({ centreId }: { centreId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    setLoading(true);
    const { error } = await syncCentreToQuickBooks(centreId);
    if (error) toast.error(error);
    else toast.success("Centre synced to QuickBooks.");
    setLoading(false);
  }

  return (
    <Button onClick={handleSync} variant="outline" size="sm" disabled={loading}>
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
      Sync to QuickBooks
    </Button>
  );
}

export function BulkCustomerSyncButton() {
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    setLoading(true);
    const { data, error } = await syncAllCentresToQuickBooks();
    if (error) {
      toast.error(error);
    } else if (data) {
      if (data.failed.length > 0) {
        toast.warning(`${data.synced} synced, ${data.failed.length} failed.`);
      } else {
        toast.success(`All ${data.synced} centres synced to QuickBooks.`);
      }
    }
    setLoading(false);
  }

  return (
    <Button onClick={handleSync} variant="outline" disabled={loading}>
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
      Sync All Centres to QuickBooks
    </Button>
  );
}
```

- [ ] **Step 2: Write payment sync button**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { syncPaymentStatuses } from "@/lib/quickbooks/actions";

export function PaymentSyncButton() {
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    setLoading(true);
    const { data, error } = await syncPaymentStatuses();
    if (error) {
      toast.error(error);
    } else if (data) {
      toast.success(`Checked ${data.checked} invoices. ${data.paid} marked as paid.`);
    }
    setLoading(false);
  }

  return (
    <Button onClick={handleSync} variant="outline" disabled={loading}>
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
      Sync Payment Status
    </Button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/outbound-invoicing/customer-sync-button.tsx components/outbound-invoicing/payment-sync-button.tsx
git commit -m "feat: add customer sync and payment sync button components"
```

---

### Task 18: Ops outbound invoicing page

**Files:**
- Create: `app/(dashboard)/ops/invoicing/outbound/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOutboundInvoices } from "@/lib/outbound-invoicing/actions";
import { isQuickBooksConnected } from "@/lib/quickbooks/client";
import { OutboundInvoiceList } from "@/components/outbound-invoicing/invoice-list";
import { GenerateInvoicesDialog } from "@/components/outbound-invoicing/generate-invoices-dialog";
import { PaymentSyncButton } from "@/components/outbound-invoicing/payment-sync-button";

export default async function OpsOutboundInvoicingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: invoices } = await getOutboundInvoices();
  const qbConnected = await isQuickBooksConnected();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Outbound Invoices</h1>
          <p className="text-sm text-[#666666]">
            Generate and manage invoices to centres and schools.
          </p>
        </div>
        <div className="flex gap-2">
          {qbConnected && <PaymentSyncButton />}
          <GenerateInvoicesDialog />
        </div>
      </div>

      <OutboundInvoiceList
        invoices={invoices ?? []}
        basePath="/ops/invoicing/outbound"
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/ops/invoicing/outbound/page.tsx
git commit -m "feat: add ops outbound invoicing page with generation and payment sync"
```

---

### Task 19: Ops invoice detail page

**Files:**
- Create: `app/(dashboard)/ops/invoicing/outbound/[id]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOutboundInvoiceDetail } from "@/lib/outbound-invoicing/actions";
import { isQuickBooksConnected } from "@/lib/quickbooks/client";
import { InvoiceDetail } from "@/components/outbound-invoicing/invoice-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OpsInvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get user role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: invoice, error } = await getOutboundInvoiceDetail(id);

  if (error || !invoice) notFound();

  const qbConnected = await isQuickBooksConnected();

  return (
    <div className="space-y-6">
      <InvoiceDetail
        invoice={invoice}
        userRole={profile?.role as "admin" | "ops"}
        qbConnected={qbConnected}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/ops/invoicing/outbound/\[id\]/page.tsx
git commit -m "feat: add ops invoice detail page"
```

---

### Task 20: Admin outbound invoicing page with approval queue

**Files:**
- Create: `components/outbound-invoicing/approval-queue.tsx`
- Create: `app/(dashboard)/admin/invoicing/outbound/page.tsx`

- [ ] **Step 1: Write the approval queue component**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { approveInvoice } from "@/lib/outbound-invoicing/actions";
import type { OutboundInvoiceWithCentre } from "@/lib/outbound-invoicing/actions";

interface Props {
  invoices: OutboundInvoiceWithCentre[];
}

export function ApprovalQueue({ invoices }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  if (invoices.length === 0) return null;

  async function handleApprove(invoiceId: string) {
    setLoading(invoiceId);
    const { error } = await approveInvoice(invoiceId);
    if (error) toast.error(error);
    else toast.success("Invoice approved.");
    setLoading(null);
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <h3 className="font-semibold text-[#1A1A1A] flex items-center gap-2">
        <Badge className="bg-amber-100 text-amber-800">
          {invoices.length}
        </Badge>
        Invoices Pending Approval
      </h3>
      <div className="space-y-2">
        {invoices.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between bg-white rounded-md p-3 border"
          >
            <div>
              <Link
                href={`/admin/invoicing/outbound/${inv.id}`}
                className="font-medium text-[#E8712A] hover:underline"
              >
                {inv.invoice_number}
              </Link>
              <span className="text-[#666666] ml-2">{inv.centre_name}</span>
              <span className="text-[#666666] ml-2 font-medium">
                ${inv.amount.toFixed(2)}
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => handleApprove(inv.id)}
              disabled={loading === inv.id}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading === inv.id ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle className="mr-1 h-3 w-3" />
              )}
              Approve
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the admin page**

```tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOutboundInvoices } from "@/lib/outbound-invoicing/actions";
import { isQuickBooksConnected } from "@/lib/quickbooks/client";
import { OutboundInvoiceList } from "@/components/outbound-invoicing/invoice-list";
import { ApprovalQueue } from "@/components/outbound-invoicing/approval-queue";
import { PaymentSyncButton } from "@/components/outbound-invoicing/payment-sync-button";

export default async function AdminOutboundInvoicingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: allInvoices } = await getOutboundInvoices();
  const { data: pendingInvoices } = await getOutboundInvoices({
    status: ["pending_approval"],
  });
  const qbConnected = await isQuickBooksConnected();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">
            Outbound Invoices
          </h1>
          <p className="text-sm text-[#666666]">
            Review, approve, and manage invoices to centres and schools.
          </p>
        </div>
        {qbConnected && <PaymentSyncButton />}
      </div>

      <ApprovalQueue invoices={pendingInvoices ?? []} />

      <OutboundInvoiceList
        invoices={allInvoices ?? []}
        basePath="/admin/invoicing/outbound"
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/outbound-invoicing/approval-queue.tsx app/\(dashboard\)/admin/invoicing/outbound/page.tsx
git commit -m "feat: add admin outbound invoicing page with approval queue"
```

---

### Task 21: Admin invoice detail page (reuses ops detail route)

**Files:**
- Create: `app/(dashboard)/admin/invoicing/outbound/[id]/page.tsx`

- [ ] **Step 1: Write the page**

This is identical to the ops detail page but lives under the admin route. The `InvoiceDetail` component already handles role-based actions.

```tsx
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOutboundInvoiceDetail } from "@/lib/outbound-invoicing/actions";
import { isQuickBooksConnected } from "@/lib/quickbooks/client";
import { InvoiceDetail } from "@/components/outbound-invoicing/invoice-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminInvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: invoice, error } = await getOutboundInvoiceDetail(id);

  if (error || !invoice) notFound();

  const qbConnected = await isQuickBooksConnected();

  return (
    <div className="space-y-6">
      <InvoiceDetail
        invoice={invoice}
        userRole="admin"
        qbConnected={qbConnected}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/admin/invoicing/outbound/\[id\]/page.tsx
git commit -m "feat: add admin invoice detail page"
```

---

### Task 22: Final TypeScript compilation check

- [ ] **Step 1: Run full type check**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors found. Common issues:
- Import paths: ensure all `@/lib/...` paths resolve
- `intuit-oauth` may need a type declaration file at `lib/quickbooks/intuit-oauth.d.ts`:

```typescript
declare module "intuit-oauth" {
  interface OAuthClientOptions {
    clientId: string;
    clientSecret: string;
    environment: "sandbox" | "production";
    redirectUri: string;
  }

  interface AuthorizeUriOptions {
    scope: string[];
    state: string;
  }

  interface TokenResponse {
    getJson(): {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };
  }

  class OAuthClient {
    static scopes: { Accounting: string };
    constructor(options: OAuthClientOptions);
    authorizeUri(options: AuthorizeUriOptions): string;
    createToken(url: string): Promise<TokenResponse>;
    refresh(): Promise<TokenResponse>;
    setToken(token: {
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
    }): void;
  }

  export default OAuthClient;
}
```

- [ ] **Step 2: Fix any errors and commit**

```bash
git add -A
git commit -m "fix: resolve TypeScript compilation errors for QuickBooks integration"
```

---

### Task 23: Final summary commit

- [ ] **Step 1: Verify all files are committed**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && git status
```

Expected: clean working tree

- [ ] **Step 2: Tag the feature**

```bash
git log --oneline -15
```

Verify all commits are present and the feature is complete.

---

## Follow-up Tasks (Not Blocking, Can Be Added Later)

These items from the spec are intentionally deferred to keep the initial implementation focused:

1. **Invoice list filtering UI** — The server action `getOutboundInvoices` accepts filter parameters (centre, status, period). A filter bar component with centre dropdown, status multi-select, and date range picker should be added to both ops and admin invoice list pages.

2. **Centre history tab** — On the centre detail page, add an "Invoices" tab that calls `getOutboundInvoices({ centreId })` and renders the invoice list filtered to that centre.

3. **Bulk approve** — The admin approval queue currently supports individual approve buttons. Add checkbox selection and a "Bulk Approve Selected" button that calls `approveInvoice` for each selected invoice.

4. **Duplicate DocNumber handling in QB** — If QB returns an error for a duplicate `DocNumber`, catch the specific error, increment the sequence, and retry once.

5. **`server-only` package** — Ensure `server-only` is installed (`npm install server-only`) if not already present. It's used in `client.ts` and `api.ts` to prevent accidental client-side bundling.
