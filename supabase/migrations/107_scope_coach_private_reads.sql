-- Audit §2.17: staff retain access; coaches see only their assigned centres.
DROP POLICY IF EXISTS child_insights_staff ON public.child_insights;
CREATE POLICY child_insights_staff ON public.child_insights FOR SELECT TO authenticated USING (
  public.auth_user_role() IN ('admin', 'ops') OR
  (public.auth_user_role() = 'coach' AND EXISTS (
    SELECT 1 FROM public.centre_children cc WHERE cc.child_id = child_insights.child_id
    AND cc.centre_id IN (SELECT public.auth_coach_centre_ids())
  ))
);
-- Audit §2.17.
DROP POLICY IF EXISTS coach_read_centre_notes ON public.centre_notes;
CREATE POLICY coach_read_centre_notes ON public.centre_notes FOR SELECT TO authenticated
USING (public.auth_user_role() = 'coach' AND centre_id IN (SELECT public.auth_coach_centre_ids()));
-- Audit §2.17: the class's centre, not a caller-supplied centre, is authoritative.
DROP POLICY IF EXISTS "school_class_children read for coaches" ON public.school_class_children;
CREATE POLICY "school_class_children read for coaches" ON public.school_class_children FOR SELECT TO authenticated
USING (public.auth_user_role() = 'coach' AND class_id IN (
 SELECT id FROM public.school_classes WHERE centre_id IN (SELECT public.auth_coach_centre_ids())
));
