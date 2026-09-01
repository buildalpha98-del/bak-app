-- Parent-side seam S6/S7: discounts and referral credits move
-- server-side. The booking row now carries what was applied, so
-- - the charge amount derives from bookings.total_cents (the payments
--   route rejects any client mismatch before charging), and
-- - redemption happens at confirmation, server-side — not in a
--   fire-and-forget browser promise after payment.

ALTER TABLE bookings
  ADD COLUMN discount_code_id uuid REFERENCES discount_codes(id) ON DELETE SET NULL,
  ADD COLUMN referral_reward_id uuid REFERENCES referral_rewards(id) ON DELETE SET NULL,
  ADD COLUMN discount_cents int NOT NULL DEFAULT 0;
