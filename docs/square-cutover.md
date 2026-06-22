# Square — sandbox → production cutover

The code is wired against Square sandbox by default. Going live is a
config-only change — no code changes after this commit lands. Follow
the steps in order; do step 5 last so you can't accidentally take a
real card before the rest is verified.

## How the env flag works

| Env var | Where it reads | Default | Effect |
|---|---|---|---|
| `SQUARE_ENV` | Server (Payments API route) | `sandbox` | Switches `getSquareApiUrl()` between `connect.squareupsandbox.com` and `connect.squareup.com`. |
| `NEXT_PUBLIC_SQUARE_ENV` | Client (web SDK script) | `sandbox` | Switches the Web Payments SDK CDN between `sandbox.web.squarecdn.com` and `web.squarecdn.com`. |
| `SQUARE_ACCESS_TOKEN` | Server | — | Paste sandbox token now, swap to production access token at cutover. |
| `SQUARE_LOCATION_ID` | Server | — | Same — sandbox vs production location IDs are different objects. |
| `NEXT_PUBLIC_SQUARE_APPLICATION_ID` | Client | — | Sandbox vs production app IDs are different too. |
| `NEXT_PUBLIC_SQUARE_LOCATION_ID` | Client | — | Same. |

Both `SQUARE_ENV` and `NEXT_PUBLIC_SQUARE_ENV` MUST agree on a given
deploy. If the client tokenises a card against the sandbox SDK but the
server then calls the production API, the token is rejected and the
parent sees "Payment processing failed." The shared default of
`sandbox` makes the broken state safe — no real money moves.

## Cutover checklist

1. **Apply to Square** for a production account at
   [squareup.com/au/en/payments](https://squareup.com/au/en/payments).
   Submit ABN, identity docs, bank account for settlements. Takes
   1–3 business days to approve.

2. **Create a Square production application** in the
   [Developer Dashboard](https://developer.squareup.com/apps) — separate
   from your sandbox app. Note: Application ID, Access Token, Location ID.

3. **Set up settlement bank account** in the Square seller dashboard.
   This is where parent payments land. Currency must be AUD.

4. **Test in sandbox one final time end-to-end** — use a sandbox card
   like `4111 1111 1111 1111` + any future expiry, CVV `111`, AUD
   amount. Confirm the booking flips to `confirmed` + a `payments` row
   gets written + receipt URL points at squareup.com.

5. **Flip the env vars in Vercel** — Project → Settings → Environment
   Variables → Production:

   ```
   SQUARE_ENV=production
   SQUARE_ACCESS_TOKEN=<production-access-token>
   SQUARE_LOCATION_ID=<production-location-id>
   NEXT_PUBLIC_SQUARE_ENV=production
   NEXT_PUBLIC_SQUARE_APPLICATION_ID=<production-application-id>
   NEXT_PUBLIC_SQUARE_LOCATION_ID=<production-location-id>
   ```

   Then trigger a redeploy so the new client-side env vars get baked
   into the bundle.

6. **Verify live mode is on** — hit `/parent/account` while logged in
   as a parent, check that the payment form loads without console
   errors, and inspect the loaded script tag — it should point at
   `web.squarecdn.com/v1/square.js` (no `sandbox.` prefix).

7. **First real charge** — book yourself a small test session (e.g. $1
   trial) with your own card. Confirm:
   - Booking shows `confirmed`
   - `payments` row exists with non-null `square_payment_id`
   - Receipt email arrives
   - Square dashboard shows the payment in "Transactions"
   - Refund yourself via Square seller dashboard, confirm it lands.

## Rollback

If anything goes sideways in production, set `SQUARE_ENV=sandbox` and
`NEXT_PUBLIC_SQUARE_ENV=sandbox` in Vercel and redeploy. Existing
`payments` rows still reference real Square payment IDs (you can issue
refunds through the Square dashboard manually) but new charges go
back through sandbox so you stop taking real cards.

## Files that reference Square

| File | What it does |
|---|---|
| [lib/payments/square-config.ts](../lib/payments/square-config.ts) | The env-flag resolver — single source of truth for sandbox vs production URLs. |
| [app/api/payments/create/route.ts](../app/api/payments/create/route.ts) | Server route that calls the Payments API. Uses `getSquareApiUrl()`. |
| [components/payments/square-payment.tsx](../components/payments/square-payment.tsx) | Client-side card collection. Uses `getSquareWebSdkUrl()`. |
| [app/(dashboard)/parent/account/page.tsx](../app/(dashboard)/parent/account/page.tsx) | Receipt link via `squareup.com/receipt/preview/<id>` — same URL for both environments. |
