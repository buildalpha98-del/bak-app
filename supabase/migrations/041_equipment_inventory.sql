-- ============================================================
-- Equipment Inventory — standalone item tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS equipment_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sport TEXT[],
  quantity INTEGER NOT NULL DEFAULT 0,
  condition TEXT DEFAULT 'good' CHECK (condition IN ('new', 'good', 'fair', 'poor', 'retired')),
  location TEXT DEFAULT 'warehouse',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE equipment_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_inventory" ON equipment_inventory
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_inventory" ON equipment_inventory
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_inventory" ON equipment_inventory
  FOR SELECT USING (auth_user_role() = 'coach');
