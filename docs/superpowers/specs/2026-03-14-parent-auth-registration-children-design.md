# Wave 5.1 — Parent Authentication, Registration & Child Management

## Overview

Opens the direct-to-parent channel for Build Alpha Kids. Parents authenticate via magic link, register themselves and their children, and manage child records through a consumer-facing portal distinct from the staff and client portals.

## Database Changes (Migration 033)

### Enum Additions

```sql
ALTER TYPE user_role ADD VALUE 'parent';

CREATE TYPE parent_relationship AS ENUM ('parent', 'guardian', 'carer');
```

TypeScript mirror in `/lib/types/enums.ts`:
```typescript
export type UserRole = "admin" | "ops" | "coach" | "parent";
export type ParentRelationship = "parent" | "guardian" | "carer";
```

### parent_profiles Table

```sql
CREATE TABLE parent_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name  text NOT NULL,
  last_name   text NOT NULL,
  email       text NOT NULL,
  phone       text,
  suburb      text,
  marketing_opt_in boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parent_profiles ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_parent_profiles_user_id ON parent_profiles(user_id);
CREATE INDEX idx_parent_profiles_email ON parent_profiles(email);
CREATE INDEX idx_parent_profiles_suburb ON parent_profiles(suburb);

CREATE TRIGGER parent_profiles_updated_at
  BEFORE UPDATE ON parent_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### parent_children Table

```sql
CREATE TABLE parent_children (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  child_id    uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  relationship parent_relationship NOT NULL DEFAULT 'parent',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parent_id, child_id)
);

ALTER TABLE parent_children ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_parent_children_parent ON parent_children(parent_id);
CREATE INDEX idx_parent_children_child ON parent_children(child_id);
```

### profiles Row for Parent Users

When a parent completes registration, a row is also inserted into the `profiles` table with `role = 'parent'` and `status = 'active'`. This ensures:
- `auth_user_role()` returns `'parent'` for parent users (used by RLS policies)
- The existing middleware `ROLE_ROUTES`/`ROLE_PORTAL` pattern works without special-casing
- Parent-specific data (first_name, last_name, phone, suburb, marketing_opt_in) lives in `parent_profiles`
- `profiles` row is minimal: id, role, status, created_at

### RLS Policies

**parent_profiles:**
```sql
-- Parent: read/update own record
CREATE POLICY "Parents can view own profile"
  ON parent_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Parents can update own profile"
  ON parent_profiles FOR UPDATE
  USING (user_id = auth.uid());

-- Insert: allowed during registration (service role used in server action)
-- Admin/Ops: full access
CREATE POLICY "Admin and ops full access to parent_profiles"
  ON parent_profiles FOR ALL
  USING (auth_user_role() IN ('admin', 'ops'));
```

**parent_children:**
```sql
CREATE POLICY "Parents can view own child links"
  ON parent_children FOR SELECT
  USING (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Parents can add child links"
  ON parent_children FOR INSERT
  WITH CHECK (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Parents can remove child links"
  ON parent_children FOR DELETE
  USING (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admin and ops full access to parent_children"
  ON parent_children FOR ALL
  USING (auth_user_role() IN ('admin', 'ops'));
```

**children (new policies added to existing table — do NOT replace existing staff policies):**
```sql
-- Parent: read children linked via parent_children
CREATE POLICY "Parents can view own children"
  ON children FOR SELECT
  USING (id IN (
    SELECT child_id FROM parent_children
    WHERE parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid())
  ));

-- Parent: update own linked children (medical notes, etc.)
CREATE POLICY "Parents can update own children"
  ON children FOR UPDATE
  USING (id IN (
    SELECT child_id FROM parent_children
    WHERE parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid())
  ));
```

These policies are standalone and do NOT rely on `auth_user_role()` — they join through `parent_profiles` → `parent_children` using `auth.uid()` directly.

### TypeScript Types — `/lib/types/database.ts`

```typescript
export interface ParentProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  suburb: string | null;
  marketing_opt_in: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParentChild {
  id: string;
  parent_id: string;
  child_id: string;
  relationship: ParentRelationship;
  created_at: string;
}
```

## Authentication

### Login Page — `/app/(auth)/parent-login/page.tsx`

- Reuses Supabase `signInWithOtp()` pattern from client portal
- Consumer-friendly design: orange primary (#E8712A), warm tone, "Sign in to book sessions for your kids"
- Single email input + "Send Magic Link" button
- Success state: "Check your email! We've sent you a sign-in link."
- Error handling: invalid email format, rate limiting message
- Handles Supabase auth callback: on page load, checks for auth tokens in URL hash (same pattern as `/client-login`). If session exists after callback, checks `parent_profiles` and redirects accordingly

### Server Action — `/lib/parent/actions.ts`

```typescript
export async function sendParentMagicLink(email: string): Promise<{ error: string | null }>
```
- Calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: baseUrl + '/parent-login' } })`
- After magic link callback and session creation on `/parent-login`, client-side logic:
  1. Checks if `parent_profiles` record exists for the authenticated user
  2. If exists → redirect to `/parent`
  3. If not → redirect to `/parent/register`

### Middleware Updates — `/middleware.ts`

**1. Add `/parent-login` to `PUBLIC_ROUTES`:**
```typescript
const PUBLIC_ROUTES = [
  "/login",
  "/client-login",
  "/parent-login",  // ← ADD
  "/reset-password",
  "/update-password",
  "/feedback",
  "/client/shared",
];
```

**2. Add parent to role maps:**
```typescript
const ROLE_ROUTES = {
  admin: ["/admin", "/ops", "/coach"],
  ops: ["/ops"],
  coach: ["/coach"],
  parent: ["/parent"],
};

const ROLE_PORTAL = {
  admin: "/admin",
  ops: "/ops",
  coach: "/coach",
  parent: "/parent",
};
```

**3. Add parent portal detection block BEFORE the staff dashboard auth block (before line ~108):**

Insert a new block after the client portal handling and before `isDashboardRoute` check:
```typescript
// Parent portal routes
const isParentRoute = pathname.startsWith("/parent");
if (isParentRoute) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/parent-login", request.url));
  }

  // Check if parent has completed registration
  const { data: parentProfile } = await supabase
    .from("parent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!parentProfile && !pathname.startsWith("/parent/register")) {
    return NextResponse.redirect(new URL("/parent/register", request.url));
  }

  return NextResponse.next();
}
```

**4. Exclude `/parent` from `isDashboardRoute` check** so parent routes don't fall through to the staff `profiles` lookup.

**5. Add `ROLE_LABELS` and `ROLE_ROOTS` entries** in `nav-config.ts`:
```typescript
// In ROLE_LABELS:
parent: "Parent Portal",

// In ROLE_ROOTS:
parent: "/parent",
```

## Registration Flow — `/app/(dashboard)/parent/register/page.tsx`

### Step 1: Your Details
- Fields: first_name (required), last_name (required), phone (optional), suburb (optional — free text with common Sydney suburb suggestions)
- Validation: Zod schema

### Step 2: Add Your Children
- Per child form: first_name (required), last_name (required), date_of_birth (required, date picker), gender (optional dropdown), medical_notes (textarea, optional)
- "Add Another Child" button for multiple children
- Age group auto-calculated from DOB using `calculateAgeGroup()` utility
- Minimum 1 child required

### Step 3: Confirmation
- Review all details in a summary card
- Terms and conditions checkbox (required)
- "Complete Registration" button

### On Submit (Server Action)

```typescript
export async function completeParentRegistration(data: RegistrationData): Promise<{ error: string | null }>
```

1. Create `profiles` row with `role = 'parent'`, `status = 'active'`, `id = auth.uid()` (uses admin client to bypass RLS)
2. Create `parent_profiles` record linked to `auth.uid()`
3. For each child:
   a. **Match check 1 (name + DOB):** Query `children` for `LOWER(first_name) + LOWER(last_name) + date_of_birth` match. If existing child has NULL DOB, skip name+DOB match for that record (don't match on name alone — too risky)
   b. **Match check 2 (email):** Query `children` for `parent_email = registering parent's email` (case-insensitive). Auto-link all matches (handles siblings registered under same parent email by centres)
   c. If match found → link via `parent_children` junction
   d. If no match → create new `children` record with calculated `age_group`, then link
   e. **Backfill legacy fields:** When creating a NEW child record, populate `parent_name`, `parent_email`, `parent_phone` on the `children` row with the parent's details (so ops/admin see contact info). When linking to an EXISTING child, do not overwrite existing legacy fields
4. Create `parent_children` junction records
5. Send welcome email via Resend
6. Redirect to `/parent`

### Age Group Calculation — `/lib/utils/ageGroup.ts`

```typescript
export function calculateAgeGroup(dob: Date): AgeGroup {
  const age = differenceInYears(new Date(), dob);
  if (age >= 3 && age < 5) return "3-5";
  if (age >= 5 && age < 8) return "5-8";
  if (age >= 8 && age <= 12) return "8-12";
  // Edge cases: under 3 → "3-5", over 12 → "8-12"
  return age < 3 ? "3-5" : "8-12";
}
```

### Child Matching Strategy (B+C)

- `parent_profiles` + `parent_children` is the source of truth for parent-child relationships going forward
- Legacy `parent_name`, `parent_phone`, `parent_email` fields on `children` table remain as ops-only notes
- When creating NEW children through parent registration, backfill legacy fields so ops can see contact info
- When linking to EXISTING children, do not overwrite legacy fields (ops may have different/additional contact info)
- During registration, `parent_email` on existing `children` records is used as an additional matching signal — auto-link all children whose `parent_email` matches the registering parent's email
- Name+DOB matching skips children with NULL DOB (avoids false positives from name-only matching)

## Parent Portal Layout — `/app/(dashboard)/parent/layout.tsx`

### Design Language
- Orange primary (#E8712A) but softer than staff portals — more rounded corners, lighter backgrounds, larger touch targets
- White cards on #FAFAFA background
- Consumer-friendly typography and spacing
- No sidebar complexity — clean, app-like feel

### Navigation Structure

**Mobile (bottom tabs, 5 items):**
1. Home (Home icon) — `/parent`
2. Book (Calendar icon) — `/parent/book` (placeholder)
3. My Kids (Users icon) — `/parent/kids`
4. Bookings (Ticket icon) — `/parent/bookings` (placeholder)
5. Account (User icon) — `/parent/account` (placeholder)

**Desktop (left sidebar):**
Same 5 items with expanded labels, plus sub-navigation where needed.

### Layout Component

New `ParentShell` component (simpler than `DashboardShell`):
- Top bar: Build Alpha Kids logo + parent first name
- Bottom tabs (mobile) / sidebar (desktop)
- No sync indicator, no install prompt (add later if needed)
- Does NOT use the existing `DashboardShell` — separate component for the consumer experience

### Nav Config Updates

Add `parent` entry to `NAV_CONFIG` in `nav-config.ts`:
```typescript
parent: [
  { label: "Home", href: "/parent", icon: Home, mobileOrder: 1 },
  { label: "Book", href: "/parent/book", icon: Calendar, mobileOrder: 2 },
  { label: "My Kids", href: "/parent/kids", icon: Users, mobileOrder: 3 },
  { label: "Bookings", href: "/parent/bookings", icon: Ticket, mobileOrder: 4 },
  { label: "Account", href: "/parent/account", icon: User, mobileOrder: 5 },
]
```

Also add to `ROLE_LABELS` (`parent: "Parent Portal"`) and `ROLE_ROOTS` (`parent: "/parent"`).

## Children Management — `/app/(dashboard)/parent/kids/page.tsx`

### List View
- Cards for each child: name, age (calculated from DOB), age group badge (coloured chip)
- "Add Child" button (prominent, top of page)

### Child Detail / Edit — `/app/(dashboard)/parent/kids/[childId]/page.tsx`
- Edit: first_name, last_name, date_of_birth, gender, medical_notes
- Updates `children` record directly (RLS allows parent to update linked children)
- Age group recalculated on DOB change
- "Remove Child" link — deletes `parent_children` junction record only, does NOT delete the `children` record

### Add Child
- Same form as registration step 2 (reusable component: `components/parent/child-form.tsx`)
- Same matching logic on submit (check existing children by name+DOB and parent_email)

## Email Templates — `/lib/parent/email-templates.ts`

### Branding
- Orange primary (#E8712A) with warmer, softer styling
- "Build Alpha Kids" header (no subtitle like "Centre Portal")
- Friendly, consumer-facing copy
- Same HTML table-based layout pattern as existing templates (`lib/email/templates.ts`)

### Magic Link Email
- Subject: "Sign in to Build Alpha Kids"
- Body: "Hi there! Tap the button below to sign in and manage your kids' sessions."
- CTA button: "Sign In" (orange)

### Welcome Email
- Subject: "Welcome to Build Alpha Kids!"
- Body: "Hi {first_name}, you're all set! You've registered {child_names} and can now browse and book sessions."
- Sent after registration completes via `sendEmail()` from `/lib/email/send.ts`

## Files to Create/Modify

### New Files
- `supabase/migrations/033_parent_portal.sql` — enum additions, tables, RLS, indexes, triggers
- `app/(auth)/parent-login/page.tsx` — magic link login page
- `app/(dashboard)/parent/layout.tsx` — parent portal layout with ParentShell
- `app/(dashboard)/parent/page.tsx` — dashboard placeholder
- `app/(dashboard)/parent/register/page.tsx` — 3-step registration wizard
- `app/(dashboard)/parent/kids/page.tsx` — children list
- `app/(dashboard)/parent/kids/[childId]/page.tsx` — child detail/edit
- `app/(dashboard)/parent/book/page.tsx` — placeholder
- `app/(dashboard)/parent/bookings/page.tsx` — placeholder
- `app/(dashboard)/parent/account/page.tsx` — placeholder
- `lib/parent/actions.ts` — server actions: magic link, registration, child CRUD
- `lib/parent/email-templates.ts` — parent-branded email templates
- `lib/utils/ageGroup.ts` — DOB to age group calculation
- `lib/types/parent.ts` — Zod schemas for registration validation
- `components/parent/parent-shell.tsx` — consumer portal shell
- `components/parent/registration-wizard.tsx` — 3-step wizard component
- `components/parent/child-form.tsx` — reusable child form (registration + add child)
- `components/parent/child-card.tsx` — child display card

### Modified Files
- `lib/types/enums.ts` — add `"parent"` to `UserRole`, add `ParentRelationship` type
- `lib/types/database.ts` — add `ParentProfile`, `ParentChild` interfaces
- `middleware.ts` — add `/parent-login` to PUBLIC_ROUTES, add parent portal detection block before staff auth, add parent to ROLE_ROUTES/ROLE_PORTAL
- `components/shared/navigation/nav-config.ts` — add parent nav items, ROLE_LABELS, ROLE_ROOTS

## Not In Scope (Built in Subsequent Prompts)
- Bookable sessions browsing and booking flow
- Payment integration (Square)
- Packages and credits
- Waitlist system
- Parent notifications
- Referral system
- Re-engagement campaigns
