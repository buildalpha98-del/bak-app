# Phase 1 authorisation — implementation and verification

Based on `origin/main` at `bb1a657`. This is a reviewable authorisation change, **not a completed production security remediation**. Migrations 103–108 are written but unapplied. No E2E tests, Vercel operations, package upgrades, `.env*` edits or rehearsal scripts were run.

## Checks in this cloud instance

- `npm ci --cache /tmp/bak-npm-cache --no-audit --no-fund`: passed, lockfile unchanged. The default cache was unwritable; a writable cache fixed installation without disabling integrity verification.
- `npx tsc --noEmit`: passed.
- `npx vitest run`: 172 files, 1,850 tests passed; no skipped tests.
- `npm run build`: **blocked**, not passed. The egress proxy returns HTTP 403 for `fonts.googleapis.com`. Both Bricolage Grotesque and DM Sans fail to download. The build was also attempted with an ephemeral locally generated `CALENDAR_FEED_SECRET` in the process environment, because production-mode imports now require a key. No secret was saved to a file or printed. Further build-stage failures cannot be excluded until fonts are reachable.
- Regression experiment: the new action-denial tests were copied into a clean `git archive bb1a657` outside the checkout, using the same installed dependencies. All original 20 test groups failed on the old code and pass on the changed code. This is separate from the full-suite results above.
- `npm audit --omit=dev --json --cache /tmp/bak-npm-cache`: exit 1; 36 flagged dependency entries (3 critical, 24 high, 8 moderate, 1 low). Reachability below. No upgrades.
- `git diff --check`: passed.

`A` below means `npx vitest run lib/auth/__tests__/action-denials.test.ts lib/__tests__/audit-p1-boundaries.test.ts`. The checked-in `phase1-action-gates.json` names each action. `R` means `npx vitest run lib/auth/__tests__/phase1.test.ts lib/auth/__tests__/route-denials.test.ts`.

`S` means the **unrun** seam test `npx playwright test e2e/audit-p1.spec.ts --workers=1`, test name `Phase 1: real coach/client sessions cannot cross authorisation boundaries`. It requires a locally built webpack application, matching `.next/server/server-reference-manifest.json`, authorised Supabase credentials and Jayden applying migrations first. Point `E2E_BASE_URL` at that local production server so the test does not launch a different dev build. It provisions throwaway users, centres, session, invoice, child, class, insight and notes; cleanup runs in `finally`. It fails rather than skipping when fixtures cannot be created. It sends no reset email on the expected denial path.

## Verification table

| Audit section | What changed (files) | Exact evidence / remaining proof |
|---|---|---|
| §2.1 | `lib/auth/require-role.ts`, `lib/staff/actions.ts`, staff detail UI: admin-only recovery email; no client-selected or returned password | A, staff `bulk-actions.test.ts`; S posts the actual reset action ID as a coach (unrun) |
| §2.2 | Staff creation and `lib/launch/import-actions.ts` require admin; import actor comes from session | A: staff/import action groups |
| §2.3 | All audited outbound/launch invoice mutations require admin; launch creator comes from session | A: outbound/launch invoice groups |
| §2.6 | Staff patch schema + admin gate; `103_protect_profile_privileges.sql` freezes role, also_coaches, default_pay_rate, status and financial_access | A; R `rejects extra privilege fields and invalid action values`; S profile PATCH matrix (unrun) |
| §2.7 | `104_protect_client_membership.sql` freezes centre, role, primary, class IDs and user ID for non-admin callers; service role supported | S portal PATCH matrix (unrun); no live database claim |
| §2.8 | `105_restrict_roster_rpc.sql`; optional server-only client injection in the existing `setSessionCoaches` helper; checked offer acceptance/coach withdrawal/decline use admin RPC after ownership checks | S direct coach RPC refusal + unchanged crew (unrun); existing session coach and shift tests pass; no alternative coach write path |
| §2.9 | `approveHoursAdjustment` / `rejectHoursAdjustment` use shared operational-staff guard | A: pay-rates group. **Partial**: rate self-service, direct session pay/roster writes and rate resolver access remain; see below |
| §2.10 | `108_freeze_submitted_coach_invoices.sql` permits non-staff edits only from draft, only to draft/flagged/ready, preserving owner/batch | S submitted invoice amount PATCH (unrun) |
| §2.11 | Shared guard explicitly denies both fixed demo identities; CRM conversion/stage/demo actions, attendance and staff messaging get role gates | A: CRM, attendance, messages groups; R demo-identity denial |
| §2.12 | New `admin/layout.tsx` and `ops/layout.tsx` authorise against verified user + DB role/status; existing middleware fast paths preserved. Audited launch dashboard/filter actions gated too | A layout boundary and data-loader groups; S forged role cookie + prefetch (unrun) |
| §2.13 | Email, notification, referral/discount internals, CRM automation, push/SMS delivery, feedback creation and rerostering escalation moved out of action endpoints; region/reminder/storage/invitation/report/churn actions gated; strict staff/centre/pay-rate/term/revoke schemas; shared-link revocation checks owning primary | A and internal-module boundary test; S compiled action-manifest absence checks (unrun). This is the named-action sweep, not a claim to have reviewed all 845 exports |
| §2.16 | `106_notification_insert_privileges.sql`: authenticated staff notification insert; anonymous grants revoked; permissive email-log INSERT policy removed | S anonymous notification INSERT expects SQLSTATE 42501 (unrun) |
| §2.17 | `107_scope_coach_private_reads.sql`: centre-scoped notes, class memberships and child insights | S unrelated notes/insights/class reads return empty (unrun) |
| §2.18 | `lib/utils/apiProtection.ts` has one fail-closed, timing-safe cron check; applied to 24 actual cron-style handlers, including refresh-stats | `npx vitest run lib/auth/__tests__/route-denials.test.ts`: 24 route-handler tests; R configured-key positive and forged/missing-key negatives |
| §2.14 (explicit brief item) | Deleted unreferenced invoice-callback API route | Route file absent; no invocation needed |
| §2.15 (explicit brief item) | Staff API gate on insights, proposals and delivery log; assistant uses `isInCoachPool` | R API role/pool tests; source call sites before body/service-role use |
| §2.19 (explicit brief item) | Calendar token module fails at load in production without signing secret | `npx vitest run lib/auth/__tests__/calendar-secret.test.ts` |
| §2.21 (explicit brief item) | IP + normalised-email cooldowns on magic-link/reset actions; shared bounded Zod feedback input + IP limiter on both route and public action | `npx vitest run lib/auth/__tests__/phase1.test.ts lib/auth/__tests__/feedback-boundary.test.ts`; host-aware magic-link suite remains green |

## Not fixed / limitations

- **§2.9 is only partially fixed.** The brief explicitly requires the hours-approval action guards; those are implemented. The audit also raises the product question of coach rate self-service. The existing coach pay-rate policies and broad session UPDATE policy still allow unapproved rate/pay/roster changes, and `resolve_session_pay_rate` remains callable by coaches. Closing these safely needs a decision on rate approval and conversion of legitimate coach lifecycle writes to narrow authorised operations. This PR must not be described as closing all pay-authorisation holes.
- The audit's scratch `action-matrix.txt` of 845 actions is not in this checkout. The named actions were checked, with the replacement scoped checklist committed as JSON; no complete 845-action review is claimed.
- **§2.3 correction:** the existing payroll `requireAdmin` was admin-role-only, not financial-access-aware as the audit describes. That admin-only mutation rule is preserved. Existing financial route layouts remain unchanged.
- **§2.18 correction:** this tree has 24 relevant HTTP handlers including `/api/public/refresh-stats`, rather than 23. All 24 are covered.
- **§2.8 additional callers:** coach cancellation and decline also clear the crew; both retain their lead/ownership checks and use the existing helper. Swap acceptance advances a request to `pending_ops`; actual reassignment already checks admin/ops in `approveSwap`.
- Rate limiting retains the existing per-instance in-memory store. It is not a distributed cap and cannot prevent abuse across multiple serverless instances.
- No live RLS, trigger, RPC, action transport, email delivery or production behaviour was verified. All migrations and the seam spec require owner execution. In particular, the seam spec's positive fixture paths are type-checked but unrun.
- Phases 2–5 and §2.20 storage are untouched. Dependency advisories below are not repaired in this PR.
- Build and PR creation are externally blocked by egress policy. Required additions (`fonts.googleapis.com`, `fonts.gstatic.com`, `api.github.com`) are saved in the cloud settings draft, preserving package-manager presets. A draft save does not activate networking or publish an environment.

## Production dependency reachability

Method: actual `npm audit --omit=dev` output, `npm explain <package> --omit=dev`, import/call-site searches and `next.config.ts`. "Reachable surface" means application code uses the affected feature; it does not claim an exploit was run or that every advisory on that package is exploitable on Vercel.

| Flagged entries | Production reachability assessment and evidence |
|---|---|
| `next` | **Runtime surface reachable.** This is an App Router application with public RSC pages, server actions and image optimisation. Server-action/RSC denial-of-service and middleware/cache advisories require patching; the new DB-backed gates do not patch the framework. Configuration-dependent advisories involving Windows, custom servers, Pages Router i18n, `use cache`, untrusted `beforeInteractive` or CSP nonces were not found in this app. Do not interpret those narrower exclusions as clearing the package. |
| `@sentry/nextjs` | **Affected tunnel feature configured**, `next.config.ts` sets `tunnelRoute: "/monitoring"`; GHSA-mchm-gjx6-7h55 flags middleware bypass. Runtime reachability is relevant; actual deployed DSN/tunnel behaviour was not checked. |
| `sharp` | **Image decoder reachable** through `next/image`; marketing images and centre logos use it. `next.config.ts` restricts remote inputs to the configured Supabase storage host/path. Exploitability depends on attacker ability to supply image bytes and the deployed image-processing service; no exploit tested. |
| `zod` | **Untrusted validation reachable** through API/server-action input parsing, including collection schemas. The advisory concerns oversized constrained collections; payload limits reduce exposure but do not establish immunity. |
| `ws` | Installed via Supabase realtime. No Node websocket listener or server-side channel subscription found; the current `.channel().subscribe()` callers are browser components/hooks and use browser WebSocket. **No current production path to the vulnerable Node frame parser identified**. Reassess if server realtime subscriptions are added. |
| `resend`, `svix`, `uuid` | Email SDK is runtime-used, but the reported chain ends at UUID v3/v5/v6 caller-supplied-buffer handling. No application calls to those APIs or Resend webhook verification found. **SDK loaded, vulnerable operation not identified as reachable** through this application's email sending. |
| `shadcn`, `@modelcontextprotocol/sdk`, `@hono/node-server`, `hono`, `body-parser`, `express-rate-limit`, `ip-address`, `proxy-addr`, `qs` | Installed CLI/MCP dependency tree (`npm explain`), not imported by the application or started as a production server. **No application-request reachability found**; relevant to developers running the CLI/MCP server. |
| `next-pwa`, `workbox-build`, `workbox-webpack-plugin`, `rollup-plugin-terser`, `serialize-javascript`, `lodash`, `@babel/core`, `@babel/plugin-transform-modules-systemjs`, `baseline-browser-mapping`, `brace-expansion`, `browserslist`, `fast-uri`, `js-yaml`, `nanoid`, `picomatch`, `postcss`, `postcss-selector-parser`, `source-map-js`, `path-to-regexp` | Build/CLI tooling paths identified by `npm explain`; app runtime does not compile attacker-supplied CSS, Babel modules, glob expressions, Workbox config or route patterns. **No affected operation reachable from an application request identified**. These remain supply-chain/build risks when processing untrusted sources/configuration. Some packages are installed under runtime dependencies because Next/PWA/CLI tools are declared there; `--omit=dev` alone does not establish runtime exposure. |

All 36 flagged package entries are accounted for above. Package manifests and lockfile are unchanged. Follow-up framework/security dependency work should be prioritised independently of this authorisation PR.
