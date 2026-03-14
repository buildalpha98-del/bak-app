-- 030_training_lms.sql
-- Training LMS: modules, pathways, assignments, completions

-- Enums
CREATE TYPE training_module_type AS ENUM ('video', 'document', 'quiz', 'checklist');
CREATE TYPE training_category AS ENUM ('onboarding', 'sport_specific', 'compliance', 'professional_development');
CREATE TYPE training_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE training_assignment_status AS ENUM ('assigned', 'in_progress', 'completed', 'overdue');

-- training_modules
CREATE TABLE IF NOT EXISTS training_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  type training_module_type NOT NULL,
  category training_category NOT NULL,
  content_json jsonb NOT NULL DEFAULT '{}',
  estimated_minutes int,
  is_mandatory boolean NOT NULL DEFAULT false,
  required_for_sports jsonb DEFAULT NULL,
  status training_status NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- training_pathways
CREATE TABLE IF NOT EXISTS training_pathways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category training_category NOT NULL,
  is_mandatory_onboarding boolean NOT NULL DEFAULT false,
  status training_status NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- training_pathway_modules (join table with ordering)
CREATE TABLE IF NOT EXISTS training_pathway_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pathway_id uuid NOT NULL REFERENCES training_pathways(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- training_assignments
CREATE TABLE IF NOT EXISTS training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_id uuid REFERENCES training_modules(id) ON DELETE CASCADE,
  pathway_id uuid REFERENCES training_pathways(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES profiles(id),
  due_date date,
  status training_assignment_status NOT NULL DEFAULT 'assigned',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT exactly_one_target CHECK (
    (module_id IS NOT NULL AND pathway_id IS NULL)
    OR (module_id IS NULL AND pathway_id IS NOT NULL)
  )
);

CREATE INDEX idx_training_assignments_coach ON training_assignments(coach_id);
CREATE INDEX idx_training_assignments_status ON training_assignments(status);

-- training_completions
CREATE TABLE IF NOT EXISTS training_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES training_assignments(id) ON DELETE SET NULL,
  score decimal(5,2),
  passed boolean,
  attempt_number int NOT NULL DEFAULT 1,
  completion_data jsonb DEFAULT '{}',
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_completions_coach ON training_completions(coach_id);
CREATE INDEX idx_training_completions_module ON training_completions(module_id);

-- RLS
ALTER TABLE training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_pathways ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_pathway_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_completions ENABLE ROW LEVEL SECURITY;

-- Admin/ops: full access to modules, pathways, pathway_modules
CREATE POLICY "admin_ops_modules_all" ON training_modules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );
CREATE POLICY "admin_ops_pathways_all" ON training_pathways
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );
CREATE POLICY "admin_ops_pw_modules_all" ON training_pathway_modules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Coaches: read published modules
CREATE POLICY "coach_read_published_modules" ON training_modules
  FOR SELECT USING (
    status = 'published' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );
CREATE POLICY "coach_read_published_pathways" ON training_pathways
  FOR SELECT USING (
    status = 'published' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );
CREATE POLICY "coach_read_pw_modules" ON training_pathway_modules
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- Assignments: admin/ops full, coaches read own
CREATE POLICY "admin_ops_assignments_all" ON training_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );
CREATE POLICY "coach_own_assignments" ON training_assignments
  FOR SELECT USING (coach_id = auth.uid());

-- Completions: admin/ops read all, coaches insert+read own
CREATE POLICY "admin_ops_completions_read" ON training_completions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );
CREATE POLICY "coach_own_completions" ON training_completions
  FOR ALL USING (coach_id = auth.uid());
