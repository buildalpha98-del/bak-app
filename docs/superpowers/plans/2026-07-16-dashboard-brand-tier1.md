# Dashboard Brand Alignment — Tier 1 (Identity Surfaces)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the marketing site's brand identity onto the dashboard's *identity* surfaces — the login front door, the crest, the accent colour, toasts — without touching the working surfaces where the ops lead and coaches spend their day. Fix the WCAG AA failure the dashboard is currently shipping on its primary button along the way.

**Design thesis:** *The token is the brand; the sticker is the marketing device.* Dashboard surfaces inherit the brand **colour**, correctly contrasted, in both themes. Only the pre-login front door — the seam between the marketing site and the app — inherits the marketing **treatment** (thick ink outline, hard offset shadow).

**The line this will NOT cross:** No sticker treatment on any authenticated working surface. Concretely: **the `default` Button variant is not restyled** (see recon §4 — that would change 298 buttons, 283 of them in dense data views, a 57:1 ratio against). Roster grids, tables, dense forms and data views are Tier 3 and are out of scope entirely. The marketing site has three seconds to convince a parent; the dashboard is worked in for hours. Hard shadows on a roster grid cost information density and fatigue people.

---

## Dark mode — the central call, resolved

**The finding (measured, not assumed):** the sticker treatment is a *light-ground design*. Its entire contrast model is black ink against a bright fill against a cream page. Measured against this app's actual dark tokens:

| Sticker element | Dark surface | Contrast | Verdict |
|---|---|---|---|
| `#111` outline | `--background` `#0F0806` | **1.05:1** | invisible |
| `#111` outline | `--card` `#19120F` | **1.02:1** | invisible |
| `#111` shadow | `--sidebar` `#0D0806` | **1.05:1** | invisible |

The marketing site already hit half of this problem and solved it with `shadow="orange"` (`components/marketing/sticker-button.tsx`) for dark bands. But that only rescues the *shadow*. The **outline** is `#111` too, and it dies on the same ground. Swap both to orange and you have an orange pill, orange-outlined, orange-shadowed, on near-black — which is not the brand rendered in dark mode. It is a **second brand that happens to be orange**. The defining move of this identity is black ink; remove the black ink and nothing characteristic survives.

Corroborating evidence: **the marketing site has zero `dark:` utilities across every one of its components.** The sticker system has never faced a dark ground because it was never built to. There is no dark sticker design to port — inventing one is a design project, not a port, and it is not in this plan's budget.

**The resolution — two-part, and the split is the whole point:**

1. **Brand colour → both themes, via tokens.** `--primary` aligns to brand orange. Dark mode already lightens it (`oklch(0.70 …)`) and already pairs it with near-black ink at 6.93:1. Dark mode gets the brand, properly contrasted. No sticker.
2. **Sticker treatment → the pre-login front door only, forced light.** The `(auth)` pages are the marketing↔app seam: a parent arriving from `buildalphakids.com.au` should not cross a visual cliff. Those pages render on cream, exactly the ground the sticker was designed and AA-verified against.

**Why forcing light on auth is safe here (verified, not assumed):**
- `app/(auth)/` has **no `layout.tsx`** — there is a clean, empty place to put the scope.
- The auth pages and `AuthShell` contain **zero `dark:` utilities** (verified by grep). They are 100% token-driven. So redeclaring the light token values on a scope wrapper fully controls their appearance; there are no `dark:`-variant classes left over to leak through.

**The cost, stated honestly:** a dark-mode user who signs out lands on a light login page — one white flash on one page. That is a real cost and the reason it is accepted is that this page is the brand's front door and is more likely to be arrived at *from the marketing site* than from inside a dark session. If Jayden judges the flash worse than the continuity, **cut Chunk 2 and keep Chunk 1** — they are independent, and Chunk 1 carries the accessibility fix.

---

## Accessibility convention (non-negotiable, inherited from the marketing plan)

White on brand orange `#E8712A` is **3.08:1** and **FAILS** WCAG AA at button sizes. Ink on orange passes:

| Foreground | on `#E8712A` | Verdict |
|---|---|---|
| `#FFFFFF` | 3.08:1 | **FAIL** |
| `#111111` (marketing's ink) | 6.14:1 | PASS |
| `#1C1917` (`--brand-charcoal`, this app's ink) | 5.69:1 | PASS |

**The dashboard is currently shipping an AA failure on `origin/main`.** Verified at `app/globals.css:36-37`:

```
--primary: oklch(0.65 0.19 42);            /* = #E95C12 */
--primary-foreground: oklch(0.995 0.002 75); /* = #FEFDFC, near-white */
```

That pairing measures **3.44:1 — below the 4.5:1 AA threshold.** It affects every `default` Button and every `default` Badge in light mode. The same failure exists at `app/globals.css:69` (`--sidebar-primary-foreground: oklch(0.995 0 0)` on `--sidebar-primary`). **Dark mode already does the right thing** (`--primary-foreground: oklch(0.14 0.014 45)` = near-black, **6.93:1 — passes**). The default, light theme is the broken one. Chunk 1 fixes this and is worth doing *even if the rest of this plan is rejected*.

---

## Architecture

Token-first. The brand colour is currently defined **twice, in two colour spaces, with no link between them**: `--primary: oklch(0.65 0.19 42)` (`#E95C12`) is what `Button`/`Badge` consume via `bg-primary`, while `--brand-orange: #E8712A` is a separate hex token. **They are not the same colour.** Recon §1 found 63 hardcoded `#E8712A` + 204 `orange-*` utilities against only 17 `var(--brand-*)` reads — the token layer exists and is ~94% bypassed. This plan reconciles the two definitions and does **not** attempt the 267-site hardcode migration (that is a separate cleanup, flagged below).

**Tech Stack:** Next.js 16 App Router + React 19, Tailwind v4 (`@theme inline` in `app/globals.css`, **no config file**), shadcn-derived primitives built on `@base-ui/react`, `next-themes` 0.4.6 (`attribute="class"`, `defaultTheme="light"`, `enableSystem={false}`, mounted `app/layout.tsx:104`), Sonner, Vitest.

**Dependency:** Chunk 2 imports `stickerClasses()` from `components/marketing/sticker-button.tsx`, which lands with **PR #2 (`feature/marketing-site`), not yet merged**. Chunk 2 is **blocked until PR #2 merges.** Do not duplicate the sticker tokens to unblock — that file's own docstring exists to keep the flagship CTA token set at ONE definition, and forking it would be the first step to the two drifting. Chunks 1, 3 and 4 have no such dependency and can proceed immediately.

**Conventions:**
- Australian English. Brand name always "Build Alpha Kids", never abbreviated in user-facing copy.
- Tests colocated in `__tests__/`, Vitest. Run `npx vitest run <file>` for the file under test, full `npx vitest run` before each commit.
- Commit after every green cycle. **Each chunk is its own commit and its own revert.**

---

## Blast radius and reversibility

| Change | Files | Shared with Tier 3? | Revert |
|---|---|---|---|
| Ch.1 token AA fix | 1 (`globals.css`) | **Yes — 298 buttons + badges change text colour** | one-line, visual-only |
| Ch.2 auth sticker | ~8 (`(auth)/*`) | No — 5 identity buttons | delete a directory's layout |
| Ch.3 crest | ~6 | No | swap an import |
| Ch.4 toast colour | 1 (`ui/sonner.tsx`) | Toasts fire on Tier 3, but colour-only | one-line |

**Everything in this plan is visually reversible and touches no data path.** The one wide-blast change is Chunk 1's `--primary-foreground` — it flips ~298 buttons' *text* from white to near-black. That is a real, visible change across the app. It is also the correct one (it is the AA fix), it is one line, and it is isolated as the first commit specifically so it can be reverted alone.

**What it costs to be wrong:** the dashboard is live with real users. Nothing here can corrupt data or break a flow. The realistic failure mode is *aesthetic regression the test suite cannot see* — see the verification warning below.

> **Verification warning — read before starting.** Recon §5: **zero** tests assert on classes, colours, or snapshots; **zero** snapshot files; no visual-regression harness (no Percy/Chromatic/Argos). The 2 Playwright specs use role/text selectors and are immune to restyling. **Restyling this app breaks zero tests, which means CI gives no signal whatsoever.** 298 buttons could render wrong across 158 files and CI stays green. Every task below therefore carries a **mandatory manual visual check in both themes**. Do not substitute a green build for looking at the page.

---

## File Structure

```
app/globals.css                        — MODIFY: AA fix (Ch.1), palette reconcile (Ch.2 tokens)
lib/brand/__tests__/contrast.test.ts   — CREATE: AA guard (Ch.1)
lib/brand/contrast.ts                  — CREATE: oklch→sRGB + WCAG ratio (pure, testable)
app/(auth)/layout.tsx                  — CREATE: forced-light scope (Ch.2)
components/shared/auth-shell.tsx       — MODIFY: sticker CTA slot, AppLogo (Ch.2, Ch.3)
app/(auth)/login/page.tsx              — MODIFY: sticker submit (Ch.2)
app/(auth)/parent-login/page.tsx       — MODIFY: adopt AuthShell (Ch.2)
app/(auth)/client-login/client-login-form.tsx — MODIFY: adopt AuthShell (Ch.2)
components/shared/app-logo.tsx         — MODIFY: single logo source of truth (Ch.3)
components/shared/navigation/sidebar.tsx — MODIFY: kill raw <img> (Ch.3)
components/shared/navigation/top-bar.tsx — MODIFY: kill raw <img> (Ch.3)
components/ui/sonner.tsx               — MODIFY: brand-align, no sticker (Ch.4)
```

---

## Chunk 1: Truth in tokens — fix the live AA failure

**Why first:** it is a live accessibility defect, it is independently valuable, and it is the one change with wide blast radius — isolating it as commit #1 makes it revertable alone.

### Task 1.1: Extract a testable contrast helper

**Files:**
- Create: `lib/brand/contrast.ts`
- Test: `lib/brand/__tests__/contrast.test.ts`

The repo has precedent for enforcing UI invariants via source-scanning guard tests (`lib/__tests__/no-anchor-in-table-row.test.ts`). Vitest coverage is scoped to `lib/**`, so a pure helper here is the natural home. This gives the brand work the CI signal the rest of the UI lacks.

- [ ] **Step 1: Write the failing test**

```ts
// lib/brand/__tests__/contrast.test.ts
import { describe, it, expect } from "vitest";
import { oklchToHex, contrastRatio } from "../contrast";

describe("oklchToHex", () => {
  it("converts the brand orange token", () => {
    expect(oklchToHex(0.679, 0.168, 47.2)).toBe("#E8712A");
  });
});

describe("contrastRatio", () => {
  it("scores white on brand orange as an AA failure", () => {
    expect(contrastRatio("#FFFFFF", "#E8712A")).toBeCloseTo(3.08, 1);
  });
  it("scores brand charcoal on brand orange as an AA pass", () => {
    expect(contrastRatio("#1C1917", "#E8712A")).toBeCloseTo(5.69, 1);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found).** `npx vitest run lib/brand/__tests__/contrast.test.ts`
- [ ] **Step 3: Implement** `lib/brand/contrast.ts` — oklch→linear-sRGB→gamma-encoded hex, and the WCAG 2.1 relative-luminance ratio `(L1+0.05)/(L2+0.05)`. Pure functions, no deps.
- [ ] **Step 4: Green.**

**Verify:** `npx vitest run lib/brand/__tests__/contrast.test.ts`

### Task 1.2: Guard the actual token values, then fix them

**Files:**
- Modify: `app/globals.css:37` (`--primary-foreground`), `app/globals.css:69` (`--sidebar-primary-foreground`)
- Test: `lib/brand/__tests__/contrast.test.ts` (extend)

The guard parses `app/globals.css` and asserts every brand fill/foreground pair clears 4.5:1 **in both themes**. This is what stops the failure silently returning.

- [ ] **Step 1: Write the failing test** — read `app/globals.css`, regex out the `--primary` / `--primary-foreground` pairs from the `:root` and `.dark` blocks, assert `contrastRatio(...) >= 4.5` for each. **This test MUST fail on the light pair at 3.44:1 before the fix** — that failure is the proof the bug is real. Run it and see it fail for the right reason.
- [ ] **Step 2: Fix the tokens.**

```css
/* :root — was oklch(0.995 0.002 75) = #FEFDFC, 3.44:1 on --primary. FAILED AA.
   Now --brand-charcoal #1C1917: 5.00:1 on the current orange, 5.69:1 on the
   brand orange Chunk 2 moves to. Passes either way, so this fix and the
   palette alignment revert independently. */
--primary-foreground: oklch(0.216 0.006 56);
```

Apply the same to `--sidebar-primary-foreground` (`app/globals.css:69`), which has the identical white-on-orange failure. **Do not touch the `.dark` block** — it already passes at 6.93:1 and is the reference for what correct looks like.

- [ ] **Step 3: Green.**

**Verify:**
- `npx vitest run lib/brand/__tests__/contrast.test.ts` — green.
- `npm run build` — exits 0.
- **Visual, both themes, mandatory:** `npm run dev`, then look at a page with a primary button and a primary badge (`/admin/bookings` is dense enough to judge). Confirm light-mode primary buttons now read as **near-black text on orange**, and that this looks deliberate rather than broken at `size="xs"` (h-6/24px — the smallest, most crowded case). Toggle to dark via the user menu; confirm **nothing changed** there.
- **Judgement call to escalate:** ~298 buttons flip from white to black text. If that reads as wrong to Jayden at a glance, the answer is *not* to revert to a failing contrast — it is to darken `--primary` until white passes, which is a different (and larger) decision. Surface it; do not silently pick.

**Commit:** `fix(a11y): ink on orange — primary button was 3.44:1, below AA`

---

## Chunk 2: The front door — auth, light-scoped, stickered

**BLOCKED until PR #2 (`feature/marketing-site`) merges** — imports `stickerClasses()`. Chunks 3 and 4 can proceed meanwhile.

### Task 2.1: Force light on the auth route group

**Files:**
- Create: `app/(auth)/layout.tsx`
- Modify: `app/globals.css` (add the `.auth-light-scope` token redeclaration)

`app/(auth)/` has no layout today. Add one that wraps children in a scope which redeclares the **light** values of the theme tokens as CSS custom properties. Because custom properties cascade, this wins over `.dark` on `<html>` regardless of the user's theme — and because the auth pages carry **zero `dark:` utilities** (verified), there are no variant classes left to leak through.

> Prefer this CSS-variable scope over next-themes `forcedTheme`. `forcedTheme` in a nested provider mutates `documentElement`, so signing out would flip the *whole document* out of dark and back on navigate — a worse flash than the one we are accepting. The scope is local and reversible by deleting one file.

- [ ] **Step 1:** Add `.auth-light-scope` to `app/globals.css` redeclaring `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--border`, `--input`, `--ring` to their `:root` values. Comment it with *why* (light-only sticker ground).
- [ ] **Step 2:** Create `app/(auth)/layout.tsx` applying the class to a wrapper.
- [ ] **Step 3: Verify the scope actually holds.** Toggle dark mode in the dashboard, sign out, land on `/login`. **The login page must render light.** Then confirm the dashboard is still dark after signing back in — the scope must not have leaked onto `<html>`.

**Verify:** `npm run build` exits 0. Manual: all 6 auth routes render light with dark mode on — `/login`, `/reset-password`, `/set-password`, `/update-password`, `/parent-login`, `/client-login`.

### Task 2.2: Sticker CTA on the auth submit buttons

**Files:**
- Modify: `app/(auth)/login/page.tsx`, `reset-password`, `set-password`, `update-password` (5 Buttons total)

**Do NOT restyle `components/ui/button.tsx`.** Apply `stickerClasses()` via `className` at these call sites only. Five call sites, opt-in, each one visible in the diff.

> If a later reviewer proposes promoting this to a `variant="sticker"` in the Button primitive: that is fine *as an additive variant* (opt-in, nothing inherits it). What must never happen is the `default` variant acquiring the treatment — 283 dense-view buttons inherit `default` implicitly with no `variant` prop, so they would change silently and grep would not find them.

- [ ] **Step 1:** Import `stickerClasses` from `@/components/marketing/sticker-button`; apply to each auth submit with `cn()`, preserving disabled/pending states.
- [ ] **Step 2:** Reconcile sizing. The sticker is `h-11`/`h-13`; the dashboard Button scale tops out at `h-9`. On auth the sticker's own height should win — these are hero CTAs on a card, not table actions.
- [ ] **Step 3:** Reconcile ink. `stickerClasses()` uses `#111` (6.14:1); the scope's `--primary-foreground` is `#1C1917` (5.69:1). Both pass AA. **Let `stickerClasses()` own its ink** — do not fork the marketing token set over a 0.45 delta.

**Verify:** `npm run build` exits 0. `npx vitest run` full suite green. **Visual:** every auth page, light and (toggled) dark — the sticker must render identically in both, proving the scope. Keyboard-tab to each submit and confirm the `focus-visible` ring survives (`stickerClasses()` ships its own; make sure `cn()` ordering has not dropped it).

### Task 2.3: Bring the two orphan auth pages onto AuthShell

**Files:**
- Modify: `app/(auth)/parent-login/page.tsx`, `app/(auth)/client-login/client-login-form.tsx`

Recon §3: 4 of 6 auth pages use `AuthShell` (and therefore `.auth-field-bg`); these two are bespoke — `parent-login` hand-rolls `bg-orange-50/50` + orange orbs, `client-login` uses `bg-slate-50` with **cyan/teal** orbs. They also use a different logo asset (`/logo.png` via `AppLogo`) than `AuthShell` (`/logo-full.png` via raw `<img>`). Three different front doors is the single biggest identity inconsistency the recon found.

- [ ] **Step 1:** Port both onto `AuthShell`, preserving their distinct titles ("Parent Portal", "Centre Portal") and their magic-link flows.
- [ ] **Step 2: Raise, do not decide —** `client-login`'s teal is *deliberate* (there is an explicit code comment: "teal accent instead of orange"). It may be intentional white-label differentiation for centres. **Ask Jayden before flattening it to orange.** If it stays teal, `AuthShell` needs an accent prop rather than a hardcoded orange bar — and note teal-vs-orange is exactly the Tier 2 parent/centre-portal question this plan is not scoped to answer.

**Verify:** build + full suite. **Visual:** all 6 auth pages side by side — they must read as one front door. Magic-link flows still work end to end on both.

**Commit:** `feat(auth): brand the front door — light-scoped sticker CTAs`

---

## Chunk 3: One crest

**Files:**
- Modify: `components/shared/app-logo.tsx`, `components/shared/auth-shell.tsx:41`, `components/shared/navigation/sidebar.tsx:39`, `components/shared/navigation/top-bar.tsx:28`

Recon §2: there are **two logo components, two assets, and three raw `<img>` tags** (each with an `eslint-disable @next/next/no-img-element`) bypassing both. The staff dashboard renders `/logo-full.png` via raw `<img>`; the parent/client portals render `/logo.png` via `<AppLogo>`. Nothing reconciles them. This is pure identity, zero Tier-3 overlap, and the cheapest real win in the plan.

- [ ] **Step 1:** Decide the canonical asset. `logo.png` vs `logo-full.png` are different marks (the recon could not determine which is the crest vs. the lockup) — **look at both before choosing**, and expect the answer to be "both, at different sizes": a crest for the 32px sidebar rail, the full lockup for the 112px auth card.
- [ ] **Step 2:** Extend `AppLogo` to cover every case (`sm`/`lg` exist; the sidebar needs `size-9`, top-bar `size-8`, auth `h-28`). Keep it `next/image`.
- [ ] **Step 3:** Replace all three raw `<img>` tags with `<AppLogo>` and **delete the three `eslint-disable` comments** — if they are still needed, the migration did not work.
- [ ] **Step 4:** Leave the text `BAK` wordmark beside the sidebar crest alone unless Jayden asks — it is legible at rail width where a crest alone is not, and "BAK" is fine as *chrome* even though the brand name is never abbreviated in *copy*.

**Out of scope, deliberately:** the 8 PDF templates and 7 email templates that render a text `<h1>` instead of the crest. Email clients and `@react-pdf` do not share this component tree; that is its own piece of work with its own asset-hosting problem (`lib/launch/email-templates.ts:30` is the only email with an image logo — evidence the others were skipped for a reason).

**Verify:** `npm run build` exits 0 (catches `next/image` config issues). `npx eslint` clean — no `no-img-element` suppressions remain. **Visual:** sidebar at collapsed and expanded width, top-bar on a narrow mobile viewport, auth card. Confirm no CLS or blur at each size.

**Commit:** `refactor(brand): one crest, one component`

---

## Chunk 4: Toasts — brand colour, no sticker

**Files:**
- Modify: `components/ui/sonner.tsx`

Recon §4: Sonner, mounted **once** at `app/layout.tsx:106`, **767 call sites across 146 files** — but every call site imports `toast` from `"sonner"` directly and passes no styling. So the entire toast system restyles from **one file, zero call-site changes.** Best identity-value-to-blast-radius ratio in the plan.

**This is where the thesis gets tested.** Toasts are an identity surface *and* they fire constantly on working surfaces (428 `toast.error` + 304 `toast.success` calls). A hard-shadowed sticker toast on every save is exactly the fatigue this plan exists to avoid. **Brand-align the colour; do not sticker the toast.**

- [ ] **Step 1:** Align the success/info accent to the brand orange token. Keep error on `--destructive` — brand orange and error red are close enough in hue that an orange *error* toast is a genuine legibility hazard.
- [ ] **Step 2: Handle the `richColors` conflict.** `app/layout.tsx:106` sets `richColors`, which **overrides** the `--normal-bg`/`--normal-text` vars `sonner.tsx` sets — so today that custom theming only applies to bare `toast()` calls, and typed toasts (`toast.success` etc., the overwhelming majority) ignore it. Either drop `richColors` and theme all states explicitly, or keep it and accept that only bare toasts are branded. **Decide deliberately and comment the choice** — this is a live footgun that will confuse the next person.
- [ ] **Step 3:** Verify contrast on every toast state via the Chunk 1 helper. Toast text on a brand-orange ground has the same 3.08:1 white-on-orange trap.

**Verify:** `npm run build`. **Visual, both themes:** trigger one of each — success, error, warning, info. Sonner is theme-aware via `next-themes` (`components/ui/sonner.tsx`), so **dark mode is a real code path here, not a hypothetical.** Confirm all four are legible on both grounds.

**Commit:** `feat(brand): brand-align toast accents`

---

## Explicitly NOT doing — and why

These were in the Tier-1 brief. The recon says they are the wrong call, and here is the evidence.

1. **Restyling the `default` Button variant. — The brief's biggest mis-assignment.**
   The brief lists "primary buttons" as an identity surface. **Measured, it is not one.** Restyling `default` changes **298 buttons across 158 files: 283 in dense data views, 5 on auth.** A 57:1 ratio against. The `default` variant is not the identity button — **it is the table action button.** Worse: **291 of the 298 are implicit** (no `variant` prop at all), so they inherit silently and `grep "variant=\"default\""` finds only 7 — it understates the risk by 40×. And 12+ dynamic call sites use `variant={active ? "default" : "outline"}` as a segmented control, so a hard shadow on `default` turns every filter toggle into a flickering pressed state. Additionally: the Button size scale is h-6/h-7/h-8/h-9 — a 4px offset shadow on a 24px-tall button is not a brand, it is a rendering artifact. **Tier 1 gets the sticker via opt-in at 5 auth call sites (Task 2.2), never via the shared default.**

2. **A dark-mode sticker treatment.** Covered above: `#111` on dark measures 1.02–1.05:1. There is no dark sticker to port; inventing one is a design project, and the result would be a second brand.

3. **Mass-migrating page headers.** The brief lists "page headers" as Tier 1. There is **no shared page-header component** — `.page-header-sport` is a hand-copied class string on 32 of 99 dashboard pages (29 of the 32 byte-identical). Extracting a `PageHeader` is worthwhile hygiene, but it is a **~99-file mechanical refactor with no visual change, across overwhelmingly Tier-3 surfaces.** That is a refactor wearing brand-work's clothes. Do it as its own PR, judged as refactoring. The existing class already covers the training/performance/inbox/onboarding pages.

4. **Mass-migrating empty states.** The brief conflates two different things. **(a)** The friendly zero-state a new user meets — genuinely identity. **(b)** "No results" inside a filtered table — that is a working surface; an empty roster grid is still a roster grid. Only (a) is Tier 1, and the recon found the shared `components/shared/empty-state.tsx` (with a 10-preset `EMPTY_STATES` map) is **dead code with zero importers**, while 7 bespoke `EmptyState` components with mutually incompatible prop signatures serve 24 call sites, plus ~50 files of inline copy. Wiring the dead component across all of them is a large migration into mostly-Tier-3 territory. **Adopt it where it is a true zero-state; leave table empties alone.** Separate piece of work.

5. **The 267-site hardcode migration.** 63 raw `#E8712A` + 204 `orange-*` utilities vs 17 `var(--brand-*)` reads — ~94% of brand colour bypasses the token layer. Chunk 1 reconciles the *definitions*; migrating the call sites is a big, mechanical, separately-revertable cleanup. Note ~16 are **not fixable** — `components/client/report-pdf-template.tsx` and `components/crm/embed-form-view.tsx` legitimately need literal hex (PDF rendering, embeddable iframe) where CSS vars do not resolve. **Recommended follow-up:** a `no-hardcoded-brand-hex` source-scanning guard test, modelled on the existing `lib/__tests__/no-anchor-in-table-row.test.ts`, to stop 63 becoming 80. That is the highest-leverage thing here and it is cheap.

6. **Tier 2 (parent portal).** Out of scope by instruction. Noted for whoever picks it up: it uses `AppLogo`+`/logo.png` (not the dashboard's `/logo-full.png`), `components/parent/parent-shell.tsx` is its own shell, and `client-login`'s deliberate **teal** accent (vs. parent's orange) suggests centre-vs-parent differentiation may already be an intentional design position worth preserving rather than flattening.

---

## Is the tiered approach itself right?

**Yes — with one correction, and the correction matters more than the endorsement.**

The marketing/dashboard split is sound and the Stripe analogy holds: a 3-second persuasion surface and an 8-hour working surface have genuinely different jobs, and the measured Button data proves the instinct empirically rather than by taste — 93% of "primary buttons" are table actions.

**The correction:** the Tier-1 list was drawn by *naming component types* ("primary buttons", "empty states", "page headers") rather than by *naming surfaces*. Component types cut across tiers — that is precisely why `Button` looked like Tier 1 and measured as Tier 3. **The tier boundary must be drawn around surfaces (routes/screens), and shared primitives must only ever be extended additively (opt-in variants), never restyled in place.** Applying that correction: Tier 1 shrinks to *auth pages + crest + tokens + toasts* — which is what this plan builds — and roughly half the original brief moves to "separate refactor, judged on its own merits".

The one thing that genuinely does not fit the tiering: **the AA failure**. It is not a branding question, it is a live defect on a working surface, and it should ship regardless of what happens to the rest of this plan.
