# Dashboard Brand Alignment — Tier 1 (Identity Surfaces)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the marketing site's brand identity onto the dashboard's *identity* surfaces — the login front door, the crest, the accent colour, toasts — without touching the working surfaces where the ops lead and coaches spend their day. Fix the WCAG AA failure the dashboard is currently shipping on its primary button along the way.

**Design thesis:** *The token is the brand; the sticker is the marketing device.* Dashboard surfaces inherit the brand **colour**, correctly contrasted, in both themes. Only the pre-login front door — the seam between the marketing site and the app — inherits the marketing **treatment** (thick ink outline, hard offset shadow).

**The line this will NOT cross:** No sticker treatment on any authenticated working surface. Concretely: **the `default` Button variant is not restyled** (see below — that would change 298 buttons, 283 of them in dense data views, a 57:1 ratio against). Roster grids, tables, dense forms and data views are Tier 3 and are out of scope entirely. The marketing site has three seconds to convince a parent; the dashboard is worked in for hours. Hard shadows on a roster grid cost information density and fatigue people.

---

## Read this first: tier by ROUTE, never by component type

**This is the load-bearing principle of the plan. If you read nothing else, read this.**

The original brief drew Tier 1 by naming **component types** — "primary buttons", "empty states", "page headers". That framing is broken, and it is broken in a way that looks completely reasonable until you measure it: **component types cut across surfaces.** A `Button` is not an identity thing or a working thing; it is *both*, and the split is not 50/50.

Measured on this codebase:

| | count | share |
|---|---|---|
| `Button` usages that are **dense working surfaces** | **283** | 93% |
| `Button` usages that are **identity surfaces** (auth) | **5** | 2% |

**The `default` Button variant is not the identity button — it is the table action button.** A 57:1 ratio. Restyling it to "brand the primary button" would have rebranded 283 roster/table/form actions and 5 login screens, which is the precise opposite of the intent.

It gets worse. **291 of the 298 affected buttons are *implicit*** — no `variant` prop at all, inheriting `default` silently. `grep 'variant="default"'` returns **7**. The naive grep understates the blast radius by **40×**. A reviewer sanity-checking "how many buttons does this touch?" would get a reassuring, wrong answer.

**The rule that follows, and that every task here obeys:**

> **Draw the tier boundary around routes/screens, not component types. Shared primitives are extended _additively_ (opt-in variants, applied at call sites) and never restyled in place.**

Applying that rule is what produced this plan's shape: Tier 1 shrank to *auth routes + crest + tokens + toasts*, and roughly half the original brief moved to "separate refactor, judged on its own merits" (see **Explicitly NOT doing**). The one item that escapes the tiering entirely is the **live AA failure** — that is not a branding question but a defect, and it ships regardless.

---

## Owner decisions (recorded 2026-07-16 — do not re-open without Jayden)

**A. `client-login` KEEPS ITS TEAL.** Brand the centre login **structurally** — crest, sticker treatment, layout, light-scope — but **leave the teal/blue accent intact.** Centres keep a visually distinct front door.

*Rationale, and the alternative that was explicitly rejected:* flattening `client-login` to orange was considered and **rejected by Jayden**. The teal is not a stray one-off — it is a documented whole-portal convention at `CLAUDE.md:61`: *"**Client portal:** teal/blue accent. Parent portal: warmer consumer design"*, and the code comment in `client-login-form.tsx` ("teal accent instead of orange") is downstream of it. Flattening only the *login* would produce **an orange door into a teal room** — worse than either consistent option. Making the whole client portal orange is a Tier-2-scale decision this plan is not scoped to make. So: teal stays.

*Consequence for the work:* `AuthShell` currently hardcodes an orange gradient accent bar. It **needs an accent prop** (default orange, teal for `client-login`) rather than a hardcoded one. This is a real design change to a shared component, not a copy tweak — budget for it in Task 2.3.

**B. All three "bad idea" calls stand** as explicit non-goals: no `Button.default` restyle, page-headers and empty-states out of Tier 1, no dark sticker. Reasoning preserved under **Explicitly NOT doing** — a plan that records what was deliberately *not* done is worth more than one that only lists tasks.

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

Token-first. The brand colour is currently defined **twice, in two colour spaces, with no link between them**: `--primary: oklch(0.65 0.19 42)` (`#E95C12`) is what `Button`/`Badge` consume via `bg-primary`, while `--brand-orange: #E8712A` is a separate hex token. **They are not the same colour** — and that unlinked pair is the root cause of the hardcoding: measured, there are **63 hardcoded `#E8712A` + 204 `orange-*` utilities against only 17 `var(--brand-*)` reads** (and all 17 read the same single token, `--brand-orange-light`). The token layer exists and is **~94% bypassed** — because the token that *is* wired to `Button`/`Badge` is the wrong orange, so anyone wanting brand orange had to hardcode it. This plan reconciles the two definitions and does **not** attempt the 267-site hardcode migration (that is a separate cleanup, flagged below).

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

> ## Verification warning — CI CANNOT CATCH A RESTYLE REGRESSION
>
> Measured on this repo: **zero** tests assert on classes, colours, or variants (`toHaveClass`, `bg-primary`, `buttonVariants`, `#E8712A` across every test file: **0 matches**). **Zero** snapshot files. No visual-regression harness — no Percy, Chromatic or Argos; `playwright.config.ts:35`'s `screenshot: "only-on-failure"` is a debugging artifact, not an assertion. The 2 Playwright specs use role/text selectors and are immune to restyling.
>
> **Restyling this app breaks zero tests. 298 buttons could render wrong across 158 files and CI stays green.**
>
> Therefore: **"verified" NEVER means "it compiled".** Every task below carries a **mandatory visual check that names the exact routes to open and the exact themes to open them in.** A green `npm run build` proves the app builds; it proves nothing about whether this work is correct. Do not tick a task's verification box without having looked at every route listed in it.
>
> **The one-time setup, do this before Task 1.1:** `npm run dev`, and confirm you can toggle themes via the user menu (`components/shared/theme-toggle.tsx`, in `components/shared/navigation/user-menu.tsx:83`). Every visual check below assumes you can flip light/dark on demand.

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
- **Visual, MANDATORY, BOTH THEMES.** This is the widest-blast change in the plan (~298 buttons); the build proves nothing. Open **each** of these:
  - `/admin/bookings` — dense: primary buttons + badges next to table actions. The main judgement call.
  - `/admin/crm` — has `variant={active ? "default" : "outline"}` segmented toggles; confirm the active state still reads as "selected" with ink text.
  - `/login` — a primary button on the cream auth ground (the Chunk 2 target, pre-sticker).
  - Any page with a `size="xs"` button (h-6/24px, the smallest, most crowded case) — confirm ink-on-orange looks **deliberate, not broken**, at 24px.
  - **Then toggle to dark on all of the above and confirm NOTHING changed.** Chunk 1 must not touch dark; if anything moved there, the `.dark` block was edited by mistake.
- **Judgement call to escalate, do not silently pick:** ~298 buttons flip from white to black text — a real, visible, app-wide change. If that reads as wrong to Jayden at a glance, the answer is **not** to revert to a failing contrast. It is to darken `--primary` until white passes (~`oklch(0.55 …)`), which is a *different and larger* decision — it changes the brand colour rather than the ink. Surface both options with the measured ratios.

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

### Task 2.3: Bring the two orphan auth pages onto AuthShell — teal preserved

**Files:**
- Modify: `components/shared/auth-shell.tsx` (add accent prop), `app/(auth)/parent-login/page.tsx`, `app/(auth)/client-login/client-login-form.tsx`

4 of 6 auth pages use `AuthShell` (and therefore `.auth-field-bg`); these two are bespoke — `parent-login` hand-rolls `bg-orange-50/50` + orange orbs, `client-login` uses `bg-slate-50` with **cyan/teal** orbs. They also use a different logo asset (`/logo.png` via `AppLogo`) than `AuthShell` (`/logo-full.png` via raw `<img>`). Three different front doors is the single biggest identity inconsistency in the app.

> **OWNER DECISION A applies here — read it above before starting.** The teal is **not** an inconsistency to fix. It implements `CLAUDE.md:61` (*"Client portal: teal/blue accent"*). Flattening it to orange was **considered and explicitly rejected**: it would make an orange door into a teal room. **Do not orange-ify `client-login`.** Unify *structure*; preserve *accent*.

- [ ] **Step 1: Give `AuthShell` an accent prop.** It currently hardcodes an orange gradient bar (`auth-shell.tsx:36`: `from-primary via-[#FFD600] to-[#4CAF50]`) plus four hardcoded orb colours. Parameterise: `accent?: "orange" | "teal"`, defaulting to `orange`. Both accents must satisfy the same AA rule as everything else — run the teal through the Chunk 1 `contrastRatio` helper against anything it sits behind; do not assume it passes because it is currently shipping.
- [ ] **Step 2:** Port both pages onto `AuthShell`, preserving their distinct titles ("Parent Portal", "Centre Portal") and their magic-link flows. `parent-login` → `accent="orange"`; `client-login` → `accent="teal"`.
- [ ] **Step 3:** The sticker CTA (Task 2.2) applies to **both**. The sticker's ink outline and hard shadow are accent-independent — they are `#111` on cream either way — so a teal-accented centre door still reads as the same brand. **This is the point of Decision A**: structure carries the brand, accent carries the portal.
- [ ] **Step 4: Do NOT touch the client portal beyond its login page.** The teal convention runs through the whole client portal (`components/client/*`); this task ends at the front door. The portals themselves are Tier 2.

**Verify:**
- `npm run build` exits 0. `npx vitest run` full suite green.
- **Visual, MANDATORY — open all six, light theme:** `/login`, `/reset-password`, `/set-password`, `/update-password`, `/parent-login`, `/client-login`. They must read as **one front door with two accents** — same layout, same crest, same sticker CTA, same field-marking ground; orange on five, **teal on `/client-login`**.
- **Explicitly confirm `/client-login` is still teal.** If it came out orange, Decision A has been violated — revert and re-read it.
- **Functional:** both magic-link flows still work end to end (request link → email → callback → lands in the right portal). This task touches auth; a broken magic link is the one failure here that is not merely cosmetic.

**Commit:** `feat(auth): brand the front door — light-scoped sticker CTAs`

---

## Chunk 3: One crest

**Files:**
- Modify: `components/shared/app-logo.tsx`, `components/shared/auth-shell.tsx:41`, `components/shared/navigation/sidebar.tsx:39`, `components/shared/navigation/top-bar.tsx:28`

There are **two logo components, two assets, and three raw `<img>` tags** (each with an `eslint-disable @next/next/no-img-element`) bypassing both. The staff dashboard renders `/logo-full.png` via raw `<img>`; the parent/client portals render `/logo.png` via `<AppLogo>`. Nothing reconciles them. This is pure identity, zero Tier-3 overlap, and the cheapest real win in the plan.

- [ ] **Step 1:** Decide the canonical asset. `logo.png` vs `logo-full.png` are different marks (the recon could not determine which is the crest vs. the lockup) — **look at both before choosing**, and expect the answer to be "both, at different sizes": a crest for the 32px sidebar rail, the full lockup for the 112px auth card.
- [ ] **Step 2:** Extend `AppLogo` to cover every case (`sm`/`lg` exist; the sidebar needs `size-9`, top-bar `size-8`, auth `h-28`). Keep it `next/image`.
- [ ] **Step 3:** Replace all three raw `<img>` tags with `<AppLogo>` and **delete the three `eslint-disable` comments** — if they are still needed, the migration did not work.
- [ ] **Step 4:** Leave the text `BAK` wordmark beside the sidebar crest alone unless Jayden asks — it is legible at rail width where a crest alone is not, and "BAK" is fine as *chrome* even though the brand name is never abbreviated in *copy*.

**Out of scope, deliberately:** the 8 PDF templates and 7 email templates that render a text `<h1>` instead of the crest. Email clients and `@react-pdf` do not share this component tree; that is its own piece of work with its own asset-hosting problem (`lib/launch/email-templates.ts:30` is the only email with an image logo — evidence the others were skipped for a reason).

**Verify:** `npm run build` exits 0 (catches `next/image` config issues). `npx eslint` clean — no `no-img-element` suppressions remain. **Visual:** sidebar at collapsed and expanded width, top-bar on a narrow mobile viewport, auth card. Confirm no CLS or blur at each size.

**Commit:** `refactor(brand): one crest, one component`

---

## Chunk 4: Toasts — resolve `richColors`, then brand the colour

Sonner, mounted **once** at `app/layout.tsx:106`, **767 call sites across 146 files** — but every call site imports `toast` from `"sonner"` directly and passes no styling. So the entire toast system restyles from **one file, zero call-site changes.** Best identity-value-to-blast-radius ratio in the plan.

**This is where the thesis gets tested.** Toasts are an identity surface *and* they fire constantly on working surfaces (428 `toast.error` + 304 `toast.success` calls). A hard-shadowed sticker toast on every save is exactly the fatigue this plan exists to avoid. **Brand-align the colour; do not sticker the toast.**

### Task 4.1: Resolve the `richColors` override — a live inconsistency, fix it first

**Files:**
- Modify: `app/layout.tsx:106` and/or `components/ui/sonner.tsx`

**This is a real bug, not a footnote, and it must be settled before any theming lands on top of it** — otherwise Task 4.2 will style vars that most toasts ignore, and the work will silently no-op.

`components/ui/sonner.tsx` carefully sets `--normal-bg: var(--popover)`, `--normal-text`, `--normal-border` and custom lucide icons. But `app/layout.tsx:106` mounts `<Toaster position="top-right" richColors closeButton />`, and **`richColors` overrides those vars for every *typed* toast.** Net effect today: the custom theming applies **only to bare `toast()` calls**, while `toast.success` / `.error` / `.warning` / `.info` — **767 of the call sites, i.e. essentially all of them** — ignore it and render Sonner's stock rich palette. Two toast designs ship side by side and nobody chose that.

- [ ] **Step 1: Confirm the override before changing anything.** `npm run dev`, fire a bare `toast("hello")` and a `toast.success("hello")` from any page. They should look **different**. If they look the same, this analysis is wrong for this Sonner version — stop and re-derive rather than "fixing" a non-bug.
- [ ] **Step 2: Pick one, deliberately.** Either **(a)** drop `richColors` and theme all four states explicitly in `sonner.tsx` — full control, brand-alignable, more code; or **(b)** keep `richColors` and delete the dead `--normal-*` vars — honest about what actually applies, but gives up brand control of ~all toasts. **Recommendation: (a).** Chunk 4 exists to brand toasts, and (b) forecloses that.
- [ ] **Step 3: Comment the choice in the code**, naming `richColors` explicitly. The next person will otherwise re-add it.

**Verify:** `npm run build`. **Visual, MANDATORY:** fire a bare `toast()` and a `toast.success()` — they must now be visually consistent with each other. Anywhere with a save action works; `/admin/bookings` is convenient.

### Task 4.2: Brand-align the toast accents

**Files:**
- Modify: `components/ui/sonner.tsx`

- [ ] **Step 1:** Align the success/info accent to the brand orange token. **Keep error on `--destructive`** — brand orange and error red are close enough in hue that an orange *error* toast is a genuine legibility hazard.
- [ ] **Step 2:** Run every toast state's text-on-ground pair through the Chunk 1 `contrastRatio` helper. Toast text on a brand-orange ground hits the exact same 3.08:1 white-on-orange trap as the primary button — **do not reintroduce the bug Chunk 1 just fixed.**
- [ ] **Step 3:** Add the toast pairs to the Chunk 1 guard test if they resolve to static token values.

**Verify:**
- `npm run build`. `npx vitest run` green.
- **Visual, MANDATORY, BOTH THEMES:** trigger **all four** — success, error, warning, info. `components/ui/sonner.tsx` is theme-aware via `next-themes`, so **dark mode is a live code path here, not hypothetical — this is the one chunk where dark is not optional to check.** All four must be legible on both grounds. Easiest triggers: any save (success), a deliberately failed save (error), and `/admin/bookings?denied=financial` exercises `components/shared/denied-toast.tsx`.

**Commit:** `feat(brand): resolve richColors override, brand-align toast accents`

---

## Explicitly NOT doing — and why

These were in the Tier-1 brief. The recon says they are the wrong call, and here is the evidence.

1. **Restyling the `default` Button variant. — The brief's biggest mis-assignment.**
   The brief lists "primary buttons" as an identity surface. **Measured, it is not one.** Restyling `default` changes **298 buttons across 158 files: 283 in dense data views, 5 on auth.** A 57:1 ratio against. The `default` variant is not the identity button — **it is the table action button.** Worse: **291 of the 298 are implicit** (no `variant` prop at all), so they inherit silently and `grep "variant=\"default\""` finds only 7 — it understates the risk by 40×. And 12+ dynamic call sites use `variant={active ? "default" : "outline"}` as a segmented control, so a hard shadow on `default` turns every filter toggle into a flickering pressed state. Additionally: the Button size scale is h-6/h-7/h-8/h-9 — a 4px offset shadow on a 24px-tall button is not a brand, it is a rendering artifact. **Tier 1 gets the sticker via opt-in at 5 auth call sites (Task 2.2), never via the shared default.**

2. **A dark-mode sticker treatment.** Covered above: `#111` on dark measures 1.02–1.05:1. There is no dark sticker to port; inventing one is a design project, and the result would be a second brand.

3. **Mass-migrating page headers.** The brief lists "page headers" as Tier 1. There is **no shared page-header component** — `.page-header-sport` is a hand-copied class string on 32 of 99 dashboard pages (29 of the 32 byte-identical). Extracting a `PageHeader` is worthwhile hygiene, but it is a **~99-file mechanical refactor with no visual change, across overwhelmingly Tier-3 surfaces.** That is a refactor wearing brand-work's clothes. Do it as its own PR, judged as refactoring. The existing class already covers the training/performance/inbox/onboarding pages.

4. **Mass-migrating empty states.** The brief conflates two different things. **(a)** The friendly zero-state a new user meets — genuinely identity. **(b)** "No results" inside a filtered table — that is a working surface; an empty roster grid is still a roster grid. Only (a) is Tier 1, and the recon found the shared `components/shared/empty-state.tsx` (with a 10-preset `EMPTY_STATES` map) is **dead code with zero importers**, while 7 bespoke `EmptyState` components with mutually incompatible prop signatures serve 24 call sites, plus ~50 files of inline copy. Wiring the dead component across all of them is a large migration into mostly-Tier-3 territory. **Adopt it where it is a true zero-state; leave table empties alone.** Separate piece of work.

5. **The 267-site hardcode migration.** 63 raw `#E8712A` + 204 `orange-*` utilities vs 17 `var(--brand-*)` reads — ~94% of brand colour bypasses the token layer. Chunk 1 reconciles the *definitions*; migrating the call sites is a big, mechanical, separately-revertable cleanup. Note ~16 are **not fixable** — `components/client/report-pdf-template.tsx` and `components/crm/embed-form-view.tsx` legitimately need literal hex (PDF rendering, embeddable iframe) where CSS vars do not resolve. **Recommended follow-up:** a `no-hardcoded-brand-hex` source-scanning guard test, modelled on the existing `lib/__tests__/no-anchor-in-table-row.test.ts`, to stop 63 becoming 80. That is the highest-leverage thing here and it is cheap.

6. **Tier 2 (the portals).** Out of scope by instruction. Noted for whoever picks it up: the parent portal uses `AppLogo`+`/logo.png` (not the dashboard's `/logo-full.png`) and `components/parent/parent-shell.tsx` is its own shell. **The centre-vs-parent split is already an intentional design position, not drift** — `CLAUDE.md:61` defines it (client portal teal/blue, parent portal warmer/consumer) and Owner Decision A above upholds it. Whoever does Tier 2 should start from that convention, not from a blank page.

---

## Naming hazard: `components/marketing/` will mean two different things

Flagged because it bites Task 2.2 directly, and because it will mislead the next person.

After PR #2 merges, `components/marketing/` holds **24 components with two incompatible contracts**:

| | count | contract |
|---|---|---|
| **Public marketing site** (`hero.tsx`, `sticker-button.tsx`, `nav.tsx`, …) | 23 | **light-only**, hardcoded hex, **zero `dark:` utilities**, renders on cream |
| **Admin dashboard** (`marketing-status-pulse.tsx`) | 1 | **theme-following**, reads `bg-background`/`text-foreground`, renders in the dashboard |

`marketing-status-pulse.tsx` is already on `main` and its only consumer is `app/(dashboard)/admin/marketing/page.tsx` — **it is an admin dashboard component that happens to live in `components/marketing/` because it is about the marketing *feature*, not the marketing *site*.** It is **correct** for it to follow the theme; it is not a PR #2 bug. (An earlier read of this plan flagged it as one — that was wrong, and the correction is recorded here so it is not "fixed" by mistake.)

**Why it matters for this plan:** Task 2.2 imports `stickerClasses()` from `components/marketing/sticker-button` into an `(auth)` page — a *dashboard* surface importing from a folder that now means both things. That import is fine (the sticker genuinely is a public-site token set, and Task 2.1's light scope is what makes it safe), but the folder no longer tells you which contract you are getting. **Read the component before assuming its theme behaviour.**

**Suggested follow-up (not this plan):** split into `components/marketing-site/` (public, light-only) and leave feature-admin components under a dashboard-ish path. Cheap now, 23 files of churn later.

---

## Is the tiered approach itself right?

**Yes — with one correction, which was raised, accepted, and is now the plan's opening section.**

The marketing/dashboard split is sound and the Stripe analogy holds: a 3-second persuasion surface and an 8-hour working surface have genuinely different jobs. The measured Button data settles it empirically rather than by taste — **93% of "primary buttons" are table actions.**

**The correction (accepted 2026-07-16):** the Tier-1 list was drawn by naming *component types* rather than *surfaces*. Types cut across tiers — precisely why `Button` looked like Tier 1 and measured as Tier 3, and why the naive grep understated it 40×. The boundary is now drawn by **route**, and shared primitives are extended **additively only**. See **"Read this first"** at the top; that section is the durable takeaway and the reason this plan has the shape it does.

Applying the correction shrank Tier 1 to *auth routes + crest + tokens + toasts* and moved roughly half the original brief to separate, independently-judged refactors.

**The one thing that escapes the tiering entirely: the AA failure.** It is not a branding question — it is a live accessibility defect on a working surface, shipping today on `origin/main`, and Chunk 1 should land regardless of what happens to the rest of this plan.
