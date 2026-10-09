/**
 * Who can be put on a shift.
 *
 * Coaches, obviously — but operations and admin staff run sessions too,
 * and every list of "who can work this shift" used to be hard-filtered to
 * `role = 'coach'`, so an ops manager could not roster themselves (or be
 * rostered) at all. Every roster picker, suggestion list and the AI
 * solver reads this one list; don't re-introduce `.eq("role", "coach")`
 * on a query that decides who can work a shift.
 *
 * Ops/admin without availability rows are still ineligible for the AI
 * solver (it needs availability), so adding them here never makes the
 * solver auto-assign a manager who hasn't said when they're free.
 */
export const ROSTERABLE_ROLES = ["coach", "ops", "admin"] as const;
