// ============================================================
// Onboarding constants
// ============================================================
//
// Plain module (no "use server"): safe to import from server actions,
// route handlers, client components, and tests.
//
// Lifecycle email keys drive the queue in `centre_onboarding_emails`
// that `queueOnboardingEmail` writes to and the
// `/api/cron/onboarding-emails` handler reads from. They are distinct
// from the per-step auto_email rows the cron also processes (those
// use the step_name as email_type for backward compatibility).

export const ONBOARDING_EMAIL_KEYS = {
  welcome: "onboarding_welcome",
  docsReminder: "onboarding_docs_reminder",
  firstSessionPrep: "onboarding_first_session_prep",
  halfwayCheckIn: "onboarding_halfway_check_in",
  completionCelebration: "onboarding_complete_celebration",
} as const;

export type OnboardingEmailKey =
  (typeof ONBOARDING_EMAIL_KEYS)[keyof typeof ONBOARDING_EMAIL_KEYS];

export const ONBOARDING_TOTAL_STEPS = 10;
