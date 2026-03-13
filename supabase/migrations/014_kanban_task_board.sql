-- ============================================================
-- Migration 014: Kanban task board — configurable columns
-- ============================================================

-- 1. Create task_columns table
CREATE TABLE task_columns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(100) NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  is_final    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Ensure exactly one final column
CREATE UNIQUE INDEX idx_task_columns_single_final ON task_columns (is_final) WHERE is_final = true;

-- Enable RLS
ALTER TABLE task_columns ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD
CREATE POLICY "admin_task_columns_all" ON task_columns
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Ops + Coach: SELECT only (all rows, non-row-scoped)
CREATE POLICY "authenticated_task_columns_select" ON task_columns
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 2. Seed default columns
INSERT INTO task_columns (name, position, is_final) VALUES
  ('To Do', 0, false),
  ('In Progress', 1, false),
  ('Done', 2, true);

-- 3. Add column_id to tasks (nullable initially)
ALTER TABLE tasks ADD COLUMN column_id uuid;

-- 4. Migrate existing status values to column_id
UPDATE tasks SET column_id = (SELECT id FROM task_columns WHERE name = 'To Do') WHERE status = 'todo';
UPDATE tasks SET column_id = (SELECT id FROM task_columns WHERE name = 'In Progress') WHERE status = 'in_progress';
UPDATE tasks SET column_id = (SELECT id FROM task_columns WHERE name = 'Done') WHERE status = 'done';

-- 5. Re-sequence column_order within each column based on created_at
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY column_id ORDER BY created_at ASC) - 1 AS new_order
  FROM tasks
)
UPDATE tasks SET column_order = numbered.new_order FROM numbered WHERE tasks.id = numbered.id;

-- 6. Make column_id NOT NULL with FK
ALTER TABLE tasks ALTER COLUMN column_id SET NOT NULL;
ALTER TABLE tasks ADD CONSTRAINT tasks_column_id_fkey FOREIGN KEY (column_id) REFERENCES task_columns(id);

-- 7. Drop status column
ALTER TABLE tasks DROP COLUMN status;

-- 8. Drop task_status enum (no longer needed)
DROP TYPE IF EXISTS task_status;

-- 9. Add source field
ALTER TABLE tasks ADD COLUMN source varchar(50) NOT NULL DEFAULT 'manual';

-- 10. Make created_by nullable (system-created tasks have null)
ALTER TABLE tasks ALTER COLUMN created_by DROP NOT NULL;

-- 11. Create task_activity table
CREATE TABLE task_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  type        varchar(50) NOT NULL,
  content     text,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_activity_task_created ON task_activity (task_id, created_at);

-- Enable RLS on task_activity
ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "admin_task_activity_all" ON task_activity
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Ops: full access
CREATE POLICY "ops_task_activity_all" ON task_activity
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ops')
  );

-- Coach: SELECT on activities for their assigned tasks
CREATE POLICY "coach_task_activity_select" ON task_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
    AND task_id IN (SELECT id FROM tasks WHERE assignee_id = auth.uid())
  );

-- Coach: INSERT comments only on their assigned tasks
CREATE POLICY "coach_task_activity_insert_comment" ON task_activity
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
    AND type = 'comment'
    AND task_id IN (SELECT id FROM tasks WHERE assignee_id = auth.uid())
  );

-- 12. Update tasks RLS to use column_id instead of status
-- (existing RLS policies reference 'status' which no longer exists)
-- Drop existing coach update policy if it references status, recreate
-- Note: The existing policies in 006_rls_policies.sql reference tasks.status
-- but since we dropped the column, we need to update them.
-- The existing policies are:
--   admin_tasks_all (FOR ALL) - still works (no status reference)
--   ops_tasks_all (FOR ALL) - still works
--   coach_tasks_select (FOR SELECT WHERE assignee_id = auth.uid()) - still works
--   coach_tasks_update (FOR UPDATE WHERE assignee_id = auth.uid()) - still works
-- None of the existing RLS policies reference the status column directly,
-- so no changes needed to existing policies.
