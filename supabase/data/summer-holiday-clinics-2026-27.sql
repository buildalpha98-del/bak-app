-- Stage the summer programme for review. Drafts stay off the public calendar.
-- Run only once the campaign's production database has been verified.
BEGIN;

INSERT INTO bookable_sessions (
  id, title, description, session_type, date, start_time, end_time,
  location_name, location_address, suburb, age_group_min, age_group_max,
  max_capacity, price_cents, package_eligible, status
)
SELECT
  clinic.id, clinic.title, clinic.description, 'holiday_clinic', clinic.date,
  TIME '10:00', TIME '13:00', clinic.park, clinic.park || ', ' || clinic.suburb || ' NSW',
  clinic.suburb, 4, 15, 100, 5000, false, 'draft'
FROM (
  VALUES
    ('cb80e5d2-89a4-4661-a2ac-8988c644dc82'::uuid, 'Colour Run + Sports', DATE '2026-12-22', 'Peter Miller Park', 'Casula', 'Bring a water bottle.'),
    ('38d0eaae-8064-4a7a-ac5c-ea738bef0401'::uuid, 'Water Games + Sports', DATE '2026-12-24', 'Peter Hislop Park', 'Auburn', 'Bring a water bottle and towel.'),
    ('fc620a45-3594-45ff-b615-671f1d1d9b4d'::uuid, 'Ninja Warrior + Sports', DATE '2027-01-05', 'Peter Miller Park', 'Casula', 'Bring a water bottle.'),
    ('a8e597ca-4fda-421d-a0cb-99dd36ca30cf'::uuid, 'Mini Olympics + Sports', DATE '2027-01-07', 'Peter Hislop Park', 'Auburn', 'Bring a water bottle.'),
    ('e396b17e-697f-4647-bb5e-b91c2ad286b0'::uuid, 'Wild West + Sports', DATE '2027-01-12', 'Peter Miller Park', 'Casula', 'Bring a water bottle.'),
    ('a98826eb-8785-40e7-b212-29175239dfc9'::uuid, 'Foam Party + Sports', DATE '2027-01-14', 'Peter Hislop Park', 'Auburn', 'Bring a water bottle and towel.')
) AS clinic(id, title, date, park, suburb, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM bookable_sessions AS existing
  WHERE existing.session_type = 'holiday_clinic'
    AND existing.date = clinic.date
    AND existing.suburb = clinic.suburb
    AND existing.title = clinic.title
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
