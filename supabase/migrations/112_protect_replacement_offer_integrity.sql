-- Audit §2.8/§2.9: a replacement coach must not edit session_id, recipient,
-- expiry or status on the offer that authorises a service-role roster write.
-- Responses go through respondToReplacementOffer after verified ownership.
DROP POLICY IF EXISTS coach_respond_own_offer ON public.rerostering_events;
