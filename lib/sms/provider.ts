/**
 * SMS provider abstraction.
 *
 * The platform's notification system has three delivery channels:
 * in-app (DB + Realtime), push (web-push), and email (Resend). SMS
 * is a deliberate *escape hatch* — when an urgent-tier notification
 * recipient is offline for more than 5 minutes, the dispatcher falls
 * through to SMS so a coach who muted push still gets the alert.
 *
 * Implementations are swappable so the platform works in dev without
 * a Twilio account (see `mock-provider.ts`) and so we can drop in a
 * different provider later (MessageMedia, Vonage, etc.) without
 * touching the call sites. `getSmsProvider()` in `index.ts` picks the
 * right one based on env.
 */
export interface SmsProvider {
  /**
   * Send a single SMS to one recipient.
   *
   * Resolves with `{ id, error }` — exactly one of the two is set.
   * Implementations must NOT throw; surface errors via the `error`
   * field so the audit log row can capture them. `id` is the provider's
   * message id (used to correlate with delivery webhooks later).
   */
  send(to: string, body: string): Promise<{ id: string | null; error: string | null }>;

  /**
   * Whether the provider has the credentials/config it needs to send.
   * Used by `getSmsProvider()` to decide which implementation to hand
   * back, and by the notification fallback to decide whether SMS even
   * fires (no point hitting a stub when no real provider is wired up).
   */
  isConfigured(): boolean;
}
