-- ============================================================
-- Migration 005: Invoicing, tasks, and activity log
-- ============================================================

-- 17. coach_invoices
CREATE TABLE coach_invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  line_items_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount      decimal(10,2) NOT NULL DEFAULT 0,
  gst_amount        decimal(10,2),
  status            coach_invoice_status NOT NULL DEFAULT 'draft',
  flagged_items_json jsonb,
  pdf_url           text,
  sent_at           timestamptz,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 18. outbound_invoices
CREATE TABLE outbound_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id       uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  line_items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount          decimal(10,2) NOT NULL DEFAULT 0,
  status          outbound_invoice_status NOT NULL DEFAULT 'draft',
  qb_invoice_id   varchar(100),
  approved_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER outbound_invoices_updated_at
  BEFORE UPDATE ON outbound_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 24. tasks
CREATE TABLE tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  description         text,
  assignee_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status              task_status NOT NULL DEFAULT 'todo',
  priority            task_priority NOT NULL DEFAULT 'medium',
  due_date            date,
  column_order        int NOT NULL DEFAULT 0,
  linked_entity_type  varchar(50),
  linked_entity_id    uuid,
  created_by          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 26. activity_log (NO RLS — admin-read-only via service role)
CREATE TABLE activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action      varchar(100) NOT NULL,
  entity_type varchar(50) NOT NULL,
  entity_id   uuid,
  metadata    jsonb,
  ip_address  varchar(45),
  created_at  timestamptz NOT NULL DEFAULT now()
);
