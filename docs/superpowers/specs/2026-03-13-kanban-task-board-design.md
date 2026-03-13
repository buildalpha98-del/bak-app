# Kanban Task Board — Design Spec

## 1. Overview

A lightweight operational task manager for Build Alpha Kids. Kanban board with configurable columns, drag-and-drop, auto-created tasks from system events, and role-based views (admin/ops get full board, coaches get a simplified list of their assigned tasks).

**Key decisions:**
- Configurable columns via `task_columns` table (not fixed enum)
- Unified `task_activity` table for comments + status/assignment/priority change history
- `source` field on tasks to distinguish manual vs auto-created (equipment_issue, compliance_expiry, shift_declined, invoice_flagged)
- `@dnd-kit/core` + `@dnd-kit/sortable` for drag-and-drop
- Desktop: horizontal columns. Mobile: tabbed column view
- Vercel Cron for daily overdue task reminders at 8am AEST

## 2. Data Model

### 2.1 New table: `task_columns`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | |
| name | varchar(100) | NOT NULL | Column display name |
| position | integer | NOT NULL, default 0 | Display order (0-indexed) |
| is_final | boolean | NOT NULL, default false | "Done" column — cannot be deleted |
| created_at | timestamptz | NOT NULL, default now() | |

Constraints:
- `CREATE UNIQUE INDEX idx_task_columns_single_final ON task_columns (is_final) WHERE is_final = true;` — ensures exactly one final column

Seed 3 default rows:
- "To Do" (position 0, is_final false)
- "In Progress" (position 1, is_final false)
- "Done" (position 2, is_final true)

RLS:
- Admin: full CRUD
- Ops, Coach: SELECT all rows (non-row-scoped, all authenticated users need column names to render views)

### 2.2 New table: `task_activity`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | |
| task_id | uuid | NOT NULL, FK → tasks ON DELETE CASCADE | |
| user_id | uuid | FK → profiles, nullable | null = system action |
| type | varchar(50) | NOT NULL | comment, status_change, assignment_change, priority_change, created |
| content | text | nullable | Comment text or human-readable change description |
| metadata | jsonb | nullable | e.g. `{"from_column":"To Do","to_column":"In Progress"}` |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `task_id, created_at` for chronological activity queries.

RLS:
- Admin: full access (SELECT, INSERT, UPDATE, DELETE)
- Ops: full access (SELECT, INSERT, UPDATE, DELETE)
- Coach SELECT: `task_id IN (SELECT id FROM tasks WHERE assignee_id = auth.uid())`
- Coach INSERT with CHECK: `type = 'comment' AND task_id IN (SELECT id FROM tasks WHERE assignee_id = auth.uid())`

### 2.3 Modify `tasks` table

Migration steps:

1. Create `task_columns` table and seed default rows
2. Add `column_id uuid` to tasks (nullable initially)
3. Update existing tasks: map `status = 'todo'` → To Do column id, `'in_progress'` → In Progress column id, `'done'` → Done column id
4. Re-sequence `column_order` within each column based on `created_at` ASC (existing rows all have column_order=0)
5. Make `column_id` NOT NULL with FK → task_columns
6. Drop `status` column
7. Drop `task_status` enum type (if no other tables reference it)
8. Add `source varchar(50) NOT NULL DEFAULT 'manual'` to tasks
9. Make `created_by` nullable: `ALTER TABLE tasks ALTER COLUMN created_by DROP NOT NULL;` (system-created tasks have created_by = null)

The `column_order` integer field already exists and is used for card ordering within a column.

### 2.4 Type updates (`lib/types/database.ts`)

Update `Task` interface:
- Remove `status: TaskStatus`
- Add `column_id: string`
- Add `source: string`
- Change `created_by` from `string` to `string | null` (system-created tasks)

Add new interfaces:
```typescript
export interface TaskColumn {
  id: string;
  name: string;
  position: number;
  is_final: boolean;
  created_at: string;
}

export interface TaskActivity {
  id: string;
  task_id: string;
  user_id: string | null;
  type: "comment" | "status_change" | "assignment_change" | "priority_change" | "created";
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Task with joined relations for list/board display */
export interface TaskWithRelations extends Omit<Task, "column_id" | "assignee_id" | "created_by"> {
  column_id: string;
  column: { name: string; is_final: boolean };
  assignee: { id: string; name: string; photo_url: string | null } | null;
  creator: { id: string; name: string } | null;
  linked_entity_name: string | null;  // resolved client-side from type+id
}

/** Full task detail with activity log */
export interface TaskDetail extends TaskWithRelations {
  activities: (TaskActivity & {
    user: { name: string; photo_url: string | null } | null;
  })[];
}
```

Remove `TaskStatus` from enums (keep `TaskPriority`).

Update `NotificationEventType` in `lib/types/enums.ts` to add `task_overdue_reminder` and `task_completed`.

Update `Database` type map to add `task_columns` and `task_activity`.

## 3. Server Actions

### 3.1 `lib/tasks/actions.ts` — Core CRUD

**`getTaskColumns(): Promise<{ data: TaskColumn[] | null; error: string | null }>`**
- Returns all columns ordered by `position` ASC

**`getTasks(filters?): Promise<{ data: TaskWithRelations[] | null; error: string | null }>`**
- Joins: assignee (profiles.name, profiles.photo_url), column (task_columns.name, task_columns.is_final)
- Linked entity name: resolved via post-fetch enrichment loop (query centres/sessions/equipment_kits/profiles as needed based on linked_entity_type, batched by type)
- Filter parameters:
  - `assigneeId?: string`
  - `priority?: TaskPriority`
  - `columnId?: string`
  - `dueDateFrom?: string`
  - `dueDateTo?: string`
  - `linkedEntityType?: string`
  - `source?: string`
  - `overdueOnly?: boolean` (due_date < today AND column is not is_final)
  - `myTasksOnly?: boolean` (assignee_id = current user)
- Ordering: by `column_order` ASC within each column
- Coach role: RLS enforces seeing only assigned tasks

**`getTaskDetail(taskId): Promise<{ data: TaskDetail | null; error: string | null }>`**
- Returns task with all relations + full `task_activity` list (ordered by created_at ASC)
- Activity entries include user name + photo_url via join

**`createTask(input): Promise<{ data: Task | null; error: string | null }>`**
- Input: title, description?, assigneeId?, priority, dueDate?, linkedEntityType?, linkedEntityId?, columnId (defaults to first column by position)
- Sets `column_order` to max + 1 within the target column
- Sets `source` to `'manual'`
- Inserts `task_activity` with type `'created'`
- If `assigneeId` provided: sends `task_assigned` notification
- Logs to `activity_log`

**`updateTask(taskId, changes): Promise<{ data: Task | null; error: string | null }>`**
- Accepts partial updates to: title, description, assigneeId, priority, dueDate, linkedEntityType, linkedEntityId
- For each changed field, inserts appropriate `task_activity` entry:
  - assigneeId changed → type `assignment_change`, metadata `{ from: oldId, to: newId }`
  - priority changed → type `priority_change`, metadata `{ from: old, to: new }`
- If assignee changed to a new person: sends `task_assigned` notification to new assignee
- Logs to `activity_log`

**`moveTask(taskId, columnId, newOrder): Promise<{ error: string | null }>`**
- Updates `column_id` and `column_order`
- Reorder logic: shift tasks in target column at positions >= newOrder up by 1, then re-compact source column (close the gap left by the moved task)
- Inserts `task_activity` with type `status_change`, metadata `{ from_column: oldName, to_column: newName }`
- If moved to `is_final` column: sends `task_completed` notification to creator (skip if `created_by` is null — system-created tasks)
- Logs to `activity_log`

**`deleteTask(taskId): Promise<{ error: string | null }>`**
- Hard delete (task_activity cascades via FK)
- Logs to `activity_log`

**`addComment(taskId, content): Promise<{ data: TaskActivity | null; error: string | null }>`**
- Inserts `task_activity` with type `comment`, content = the comment text
- Available to coaches on their assigned tasks

**`markComplete(taskId): Promise<{ error: string | null }>`**
- Finds the `is_final` column
- Calls `moveTask(taskId, finalColumnId, 0)` (prepends to Done)

### 3.2 `lib/tasks/columns.ts` — Column Management (Admin Only)

**`createColumn(name): Promise<{ data: TaskColumn | null; error: string | null }>`**
- Inserts at position = max(position) + 1 (before the is_final column)
- Actually: inserts at max non-final position + 1, then shifts the final column position up

**`renameColumn(columnId, name): Promise<{ error: string | null }>`**
- Updates name. Allowed on any column including is_final.

**`reorderColumns(orderedColumnIds: string[]): Promise<{ error: string | null }>`**
- Bulk updates position for all columns based on array index
- Validates: is_final column must be last

**`deleteColumn(columnId): Promise<{ error: string | null }>`**
- Blocks if `is_final = true`
- Blocks if this is the only remaining non-final column (must always have at least one non-final column)
- Reassigns all tasks in this column to the column with the lowest position that is not being deleted and is not `is_final`
- Deletes the column
- Re-compacts remaining column positions

### 3.3 `lib/tasks/auto-create.ts` — System Task Helper

```typescript
export async function autoCreateTask(input: {
  title: string;
  description?: string;
  assigneeId?: string;
  priority: TaskPriority;
  linkedEntityType?: string;
  linkedEntityId?: string;
  source: "equipment_issue" | "compliance_expiry" | "shift_declined" | "invoice_flagged";
}): Promise<{ data: Task | null; error: string | null }>
```

**Uses `createSupabaseAdmin()` (service-role client)** to bypass RLS, since auto-tasks may be created from contexts where the current user lacks INSERT permission on tasks (e.g. coach reporting equipment issue, cron jobs).

Logic:
1. **Deduplication check:** Query for existing task where `linked_entity_type` + `linked_entity_id` + `source` match AND column is not `is_final`. If found, skip creation and return existing task.
2. Find first column (lowest position, non-final) for `column_id`
3. Insert task with `source` = input.source, `created_by` = null (system-created)
4. Insert `task_activity` with type `'created'`, `user_id = null` (system), content describing the auto-creation source
5. If `assigneeId` provided: send `task_assigned` notification
6. Log to `activity_log` with `entity_type: 'task'`

## 4. Auto-Task Integration Points

### 4.1 Equipment issue flagged
- **Trigger:** `lib/equipment/actions.ts` → `reportIssue()`
- **Currently:** Already inserts a task directly. Refactor to call `autoCreateTask()`
- **Task:** title: `"Resolve equipment issue: {kitName}"`, description: issue notes, priority: high, linkedEntityType: `"equipment_kit"`, linkedEntityId: kitId, source: `"equipment_issue"`
- **Assignee:** null (ops assigns manually) — or optionally assign to the first ops user

### 4.2 Compliance document expiring in 30 days
- **Trigger:** `app/api/cron/compliance-expiry-tasks/route.ts` (new daily cron)
- **Query:** compliance_docs where `expiry_date` between today and today+30 days, status = 'verified'
- **Task:** title: `"Renew {docType}: {coachName}"`, priority: medium, linkedEntityType: `"profile"`, linkedEntityId: userId, source: `"compliance_expiry"`
- **Assignee:** the coach whose document is expiring
- **Deduplication:** Skip if open task already exists for same coach + source

### 4.3 Shift declined with no replacement
- **Trigger:** In the swap/decline handler when a session has no coach assigned after decline
- **Task:** title: `"Find replacement: {centreName} {date} {time}"`, priority: high, linkedEntityType: `"session"`, linkedEntityId: sessionId, source: `"shift_declined"`
- **Assignee:** null (ops assigns) — or assign to first ops user

### 4.4 Coach invoice flagged
- **Trigger:** When a coach invoice status changes to `flagged`
- **Task:** title: `"Review invoice flags: {coachName}"`, priority: medium, linkedEntityType: `"coach_invoice"`, linkedEntityId: invoiceId, source: `"invoice_flagged"`
- **Assignee:** null (ops assigns)

## 5. Components

### 5.1 `components/tasks/task-board.tsx` (client component)

Main Kanban board. Props: `initialTasks`, `columns`, `userRole`, `currentUserId`.

- Uses `@dnd-kit/core` `DndContext` with `@dnd-kit/sortable` for within-column and cross-column drag
- Renders `TaskColumn` components horizontally on desktop (flex row, overflow-x-auto)
- On mobile (< 768px): renders shadcn `Tabs` with one tab per column
- `onDragEnd`: calls `moveTask()` server action optimistically (update local state immediately, revert on error)
- Keyboard shortcut: "N" key opens create dialog (via useEffect keydown listener)
- Performance: memoised cards, virtualisation not needed for ≤50 tasks

### 5.2 `components/tasks/task-column.tsx`

Single column with droppable zone. Props: `column`, `tasks`, `userRole`.

- Uses `@dnd-kit/sortable` `SortableContext` with vertical list strategy
- Header: column name + task count badge
- Renders `TaskCard` for each task
- Drop indicator line between cards during drag

### 5.3 `components/tasks/task-card.tsx`

Draggable card. Props: `task`, `onClick`.

- Uses `@dnd-kit/sortable` `useSortable` hook
- Displays: title (truncated to 2 lines), priority badge (low=grey, medium=blue, high=amber, urgent=red), assignee avatar+name, due date (red + "Overdue" if past), linked entity badge (entity name or formatted ID), source badge ("Auto" in purple if source !== 'manual')
- `onClick` → opens task detail sheet
- Minimum touch target: 44px height
- `cursor: grab` / `cursor: grabbing` during drag

### 5.4 `components/tasks/task-detail-sheet.tsx`

Slide-over panel (shadcn Sheet, side="right"). Props: `taskId`, `open`, `onClose`, `userRole`, `currentUserId`.

- Fetches full task detail via `getTaskDetail()` on open
- **Editable fields** (admin/ops only, coaches can only change status + add comments):
  - Title: inline editable (click to edit)
  - Description: textarea, saves on blur
  - Assignee: dropdown of all active profiles
  - Priority: select dropdown
  - Due date: date picker
  - Linked entity: type dropdown + entity search dropdown
- **Activity timeline:** Chronological list of all `task_activity` entries. Comments show user avatar + name + content + timestamp. Changes show icon + description (e.g. "Abdul moved to In Progress" or "System created task")
- **Comment input:** Text area + "Add" button at bottom of timeline
- **Actions:**
  - "Mark Complete" button (calls `markComplete()`)
  - "Delete Task" button with confirmation dialog (admin/ops only)
- Coach view: title and description are read-only, no delete, can add comments and change status

### 5.5 `components/tasks/create-task-dialog.tsx`

shadcn Dialog. Props: `columns`, `onCreated`.

- Form fields:
  - Title (Input, required)
  - Description (Textarea, optional)
  - Assignee (Select, populated from profiles query — admin, ops, coach roles, active status)
  - Priority (Select: low, medium, high, urgent)
  - Due date (date picker via Popover + Calendar — or simple input type="date")
  - Column (Select, defaults to first column)
  - Linked entity type (Select: Centre, Session, Equipment Kit, Coach — optional)
  - Linked entity (searchable Select, populated based on type selection — optional)
- Submit calls `createTask()` then closes dialog
- Keyboard: "N" shortcut opens this dialog (handled by parent board component)

### 5.6 `components/tasks/task-filters.tsx`

Filter bar. Props: `filters`, `onFiltersChange`, `columns`, `currentUserId`, `viewMode`, `onViewModeChange`.

- Quick filters (toggle buttons): "My Tasks", "Overdue"
- Dropdowns: Assignee, Priority, Column/Status, Linked Entity Type
- Due date range: from/to date pickers
- View toggle: Board (Kanban) / List (table) — icon buttons
- On mobile: collapses behind a "Filters" button that opens a sheet

### 5.7 `components/tasks/task-list-view.tsx`

Compact table view (alternative to Kanban). Props: `tasks`, `columns`, `onTaskClick`.

- shadcn Table with columns: Title, Status (column name badge), Priority (colour badge), Assignee, Due Date, Linked Entity
- Sortable column headers (click to sort)
- Row click → opens task detail sheet
- Same filter bar applies

### 5.8 `components/tasks/column-settings-dialog.tsx` (admin only)

shadcn Dialog for managing columns. Props: `columns`, `onUpdate`.

- List of columns with:
  - Drag handle for reordering (simple up/down buttons, or @dnd-kit sortable list)
  - Inline rename (click name to edit)
  - Delete button (disabled for is_final, shows warning: "X tasks will be moved to To Do")
- "Add Column" button at bottom
- Done column is pinned last and shows a lock icon

## 6. Pages

### 6.1 `/app/(dashboard)/ops/tasks/page.tsx`

Server component:
1. Auth check (redirect if not ops/admin)
2. Fetch `getTaskColumns()` and `getTasks()`
3. Render `<TaskFilters>` + `<TaskBoard>` (or `<TaskListView>` based on view mode)
4. Include `<CreateTaskDialog>` and `<TaskDetailSheet>`

### 6.2 `/app/(dashboard)/admin/tasks/page.tsx`

Same as ops page + column settings gear icon in the header that opens `<ColumnSettingsDialog>`.

### 6.3 `/app/(dashboard)/coach/tasks/page.tsx`

Server component:
1. Auth check (redirect if not coach)
2. Fetch `getTasks({ myTasksOnly: true })` — RLS also enforces this
3. Render simplified `<TaskListView>` (no Kanban, no create button, no assign to others)
4. Include `<TaskDetailSheet>` in coach mode (read-only fields except status + comments)

## 7. Notifications

### 7.1 Event types (add to `lib/notifications/events.ts`)

- `task_assigned` — already exists, tier: IMPORTANT
- `task_overdue_reminder` — new, tier: IMPORTANT
- `task_completed` — new, tier: INFORMATIONAL

### 7.2 Notification triggers

| Event | When | Recipients | Tier |
|-------|------|-----------|------|
| task_assigned | Task created with assignee, or reassigned | New assignee | IMPORTANT |
| task_overdue_reminder | Daily cron at 8am AEST | Each assignee with overdue tasks | IMPORTANT |
| task_completed | Task moved to is_final column | Task creator (created_by) | INFORMATIONAL |

### 7.3 Overdue cron: `app/api/cron/overdue-tasks/route.ts`

- GET handler, validates cron secret
- Query: tasks where `due_date < today` AND column `is_final = false`
- Group by `assignee_id`
- For each assignee: send one `task_overdue_reminder` notification with count
- Add to `vercel.json`: `{ "path": "/api/cron/overdue-tasks", "schedule": "0 21 * * *" }` (21:00 UTC = 8:00 AM AEDT in summer / 7:00 AM AEST in winter — accept ±1hr seasonal variance)

### 7.4 Compliance expiry cron: `app/api/cron/compliance-expiry-tasks/route.ts`

- GET handler, validates cron secret
- Query: compliance_docs where `expiry_date` between today and today+30, status = 'verified'
- For each: call `autoCreateTask()` (deduplication built in)
- Add to `vercel.json`: `{ "path": "/api/cron/compliance-expiry-tasks", "schedule": "0 21 * * *" }`

## 8. Dependencies

Add to `package.json`:
- `@dnd-kit/core` — drag-and-drop primitives
- `@dnd-kit/sortable` — sortable list/grid presets
- `@dnd-kit/utilities` — CSS utilities for transforms

## 9. File Structure

```
supabase/migrations/014_kanban_task_board.sql

lib/types/database.ts          (modify — update Task, add TaskColumn, TaskActivity)
lib/types/enums.ts             (modify — remove TaskStatus, add task_overdue_reminder + task_completed to NotificationEventType)
lib/tasks/actions.ts           (create — CRUD, move, comment, markComplete)
lib/tasks/columns.ts           (create — column management)
lib/tasks/auto-create.ts       (create — autoCreateTask helper)
lib/notifications/events.ts    (modify — add task_overdue_reminder, task_completed)
lib/equipment/actions.ts       (modify — refactor reportIssue to use autoCreateTask)

components/tasks/task-board.tsx
components/tasks/task-column.tsx
components/tasks/task-card.tsx
components/tasks/task-detail-sheet.tsx
components/tasks/create-task-dialog.tsx
components/tasks/task-filters.tsx
components/tasks/task-list-view.tsx
components/tasks/column-settings-dialog.tsx

app/(dashboard)/ops/tasks/page.tsx       (replace stub)
app/(dashboard)/admin/tasks/page.tsx     (replace stub)
app/(dashboard)/coach/tasks/page.tsx     (create)

app/api/cron/overdue-tasks/route.ts      (create)
app/api/cron/compliance-expiry-tasks/route.ts (create)

vercel.json                              (modify — add cron entries)
```

## 10. Performance Considerations

- Task board designed for ≤50 visible tasks (no virtualisation needed)
- Optimistic updates on drag-and-drop (local state first, server action async)
- Memoised task cards (`React.memo`) to prevent re-renders during drag
- Column task counts computed client-side from filtered data
- Filters applied client-side from the initial full fetch (no re-fetch on filter change)
- Task detail sheet fetches on open (not preloaded)

## 11. Follow-up Items (Not In Scope)

- Task templates (recurring tasks)
- Task dependencies / blockers
- File attachments on tasks
- Due date time (currently date-only)
- Bulk task operations (multi-select + bulk move/assign/delete)
- Task archiving (currently hard delete)
