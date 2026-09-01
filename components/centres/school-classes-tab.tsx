"use client";

// Classes tab on a school's centre page (migration 080). Self-loading
// like PortalAccessTab — takes only the centreId. Class list changes
// once a year, so the UI optimises for the bulk-setup moment: create
// the classes, then tick students into each.

import { useState, useEffect, useCallback, useTransition } from "react";
import { toast } from "sonner";
import {
  GraduationCap,
  Plus,
  Trash2,
  UserPlus,
  X,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  getSchoolClasses,
  createSchoolClass,
  deleteSchoolClass,
  assignChildrenToClass,
  removeChildFromClass,
  type SchoolClassSummary,
  type ClassRosterChild,
} from "@/lib/schools/class-actions";
import { YEAR_GROUP_OPTIONS, yearGroupSortKey } from "@/lib/schools/year-groups";
import { ClassImportDialog } from "@/components/centres/class-import-dialog";
import type { CentreType } from "@/lib/types/enums";

interface SchoolClassesTabProps {
  centreId: string;
  /** Schools get class/year/teacher vocabulary; childcare centres get
   *  room/ages/educator over the exact same tables (rooms parity). */
  centreType?: CentreType;
}

interface GroupVocab {
  group: string;
  Group: string;
  member: string;
  members: string;
  leader: string;
  yearBadge: (yearGroup: string) => string;
  namePlaceholder: string;
  yearPlaceholder: string;
  yearAria: string;
  yearOptions: readonly string[];
}

const SCHOOL_VOCAB: GroupVocab = {
  group: "class",
  Group: "Class",
  member: "student",
  members: "students",
  leader: "Teacher",
  yearBadge: (y) => `Year ${y}`,
  namePlaceholder: 'Class name (e.g. "3B")',
  yearPlaceholder: 'Year (e.g. "3" or "5/6")',
  yearAria: "Year group",
  yearOptions: YEAR_GROUP_OPTIONS,
};

const ROOM_VOCAB: GroupVocab = {
  group: "room",
  Group: "Room",
  member: "child",
  members: "children",
  leader: "Educator",
  yearBadge: (y) => `Ages ${y}`,
  namePlaceholder: 'Room name (e.g. "Possums")',
  yearPlaceholder: "Age band",
  yearAria: "Age band",
  yearOptions: ["3-5", "5-8", "8-12"],
};

export function SchoolClassesTab({
  centreId,
  centreType = "school",
}: SchoolClassesTabProps) {
  const vocab = centreType === "school" ? SCHOOL_VOCAB : ROOM_VOCAB;
  const [classes, setClasses] = useState<SchoolClassSummary[]>([]);
  const [roster, setRoster] = useState<ClassRosterChild[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await getSchoolClasses(centreId);
    setLoading(false);
    if (error || !data) {
      toast.error(error ?? "Failed to load classes.");
      return;
    }
    setClasses(
      [...data.classes].sort(
        (a, b) =>
          b.school_year - a.school_year ||
          yearGroupSortKey(a.year_group) - yearGroupSortKey(b.year_group) ||
          a.name.localeCompare(b.name)
      )
    );
    setRoster(data.roster);
  }, [centreId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const unassigned = roster.filter((c) => c.class_id === null);

  return (
    <div className="space-y-6">
      {centreType === "school" && (
        <div className="flex justify-end">
          <ClassImportDialog centreId={centreId} onImported={load} />
        </div>
      )}
      <CreateClassCard centreId={centreId} onCreated={load} vocab={vocab} />

      {classes.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-10 text-center">
          <GraduationCap className="h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 text-sm font-medium text-foreground">
            No {vocab.group}s yet
          </h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Add the {centreType === "school" ? "school" : "centre"}&apos;s{" "}
            {vocab.group} list above — the portal roster, per-{vocab.group}{" "}
            reporting and session targeting hang off it.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {classes.map((cls) => (
            <ClassCard
              key={cls.id}
              cls={cls}
              members={roster.filter((c) => c.class_id === cls.id)}
              unassigned={unassigned}
              onChanged={load}
              vocab={vocab}
            />
          ))}
        </div>
      )}

      {unassigned.length > 0 && classes.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {unassigned.length} enrolled {unassigned.length === 1 ? vocab.member : vocab.members} not
          in any {vocab.group} yet — assign them from a {vocab.group} card above.
        </p>
      )}
    </div>
  );
}

function CreateClassCard({
  centreId,
  onCreated,
  vocab,
}: {
  centreId: string;
  onCreated: () => Promise<void>;
  vocab: GroupVocab;
}) {
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [schoolYear, setSchoolYear] = useState(String(currentYear));
  const [teacher, setTeacher] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      const { error } = await createSchoolClass(centreId, {
        name,
        year_group: yearGroup,
        school_year: Number(schoolYear),
        teacher_name: teacher,
      });
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`${vocab.Group} ${name.trim()} added.`);
      setName("");
      setYearGroup("");
      setTeacher("");
      await onCreated();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="h-4 w-4 text-primary" />
          Add a {vocab.group}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_1fr_auto]">
          <Input
            placeholder={vocab.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={`${vocab.Group} name`}
          />
          <div className="flex items-center gap-1.5">
            <Input
              placeholder={vocab.yearPlaceholder}
              value={yearGroup}
              onChange={(e) => setYearGroup(e.target.value)}
              aria-label={vocab.yearAria}
              list="year-group-options"
            />
            <datalist id="year-group-options">
              {vocab.yearOptions.map((y) => (
                <option key={y} value={y} />
              ))}
            </datalist>
          </div>
          <Input
            type="number"
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            aria-label="School year"
          />
          <Input
            placeholder={`${vocab.leader} (optional)`}
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
            aria-label={`${vocab.Group} ${vocab.leader.toLowerCase()}`}
          />
          <Button
            onClick={handleCreate}
            disabled={isPending || !name.trim() || !yearGroup.trim()}
          >
            {isPending ? "Adding..." : "Add"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ClassCard({
  cls,
  members,
  unassigned,
  onChanged,
  vocab,
}: {
  cls: SchoolClassSummary;
  members: ClassRosterChild[];
  unassigned: ClassRosterChild[];
  onChanged: () => Promise<void>;
  vocab: GroupVocab;
}) {
  const [assigning, setAssigning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  function toggle(childId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(childId)) next.delete(childId);
      else next.add(childId);
      return next;
    });
  }

  function handleAssign() {
    startTransition(async () => {
      const { error } = await assignChildrenToClass(cls.id, Array.from(selected));
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(
        `${selected.size} ${selected.size === 1 ? vocab.member : vocab.members} added to ${cls.name}.`
      );
      setSelected(new Set());
      setAssigning(false);
      await onChanged();
    });
  }

  function handleRemove(child: ClassRosterChild) {
    startTransition(async () => {
      const { error } = await removeChildFromClass(cls.id, child.child_id);
      if (error) {
        toast.error(error);
        return;
      }
      await onChanged();
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Delete ${vocab.group} ${cls.name}? ${vocab.Group === "Class" ? "Students" : "Children"} stay enrolled — only the ${vocab.group} label is removed.`
      )
    )
      return;
    startTransition(async () => {
      const { error } = await deleteSchoolClass(cls.id);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`${vocab.Group} ${cls.name} deleted.`);
      await onChanged();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4 text-primary" />
            {cls.name}
            <Badge variant="secondary">{vocab.yearBadge(cls.year_group)}</Badge>
            <Badge variant="outline">{cls.school_year}</Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {cls.teacher_name ? `${cls.teacher_name} · ` : ""}
            {members.length} {members.length === 1 ? vocab.member : vocab.members}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
          className="text-muted-foreground hover:text-red-600"
          aria-label={`Delete ${cls.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {members.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <li key={m.child_id}>
                <Badge variant="secondary" className="gap-1 pr-1 font-normal">
                  {m.first_name} {m.last_name}
                  <button
                    type="button"
                    onClick={() => handleRemove(m)}
                    disabled={isPending}
                    aria-label={`Remove ${m.first_name} from ${cls.name}`}
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No {vocab.members} assigned yet.
          </p>
        )}

        {assigning ? (
          <div className="mt-3 rounded-lg border bg-muted/30 p-3">
            {unassigned.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every enrolled {vocab.member} is already in a {vocab.group}.
                Remove one from its {vocab.group} first to move it here.
              </p>
            ) : (
              <>
                <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                  {unassigned.map((c) => (
                    <label
                      key={c.child_id}
                      className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.child_id)}
                        onChange={() => toggle(c.child_id)}
                      />
                      {c.first_name} {c.last_name}
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={handleAssign} disabled={isPending || selected.size === 0}>
                    {isPending ? "Adding..." : `Add ${selected.size || ""}`.trim()}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAssigning(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={() => setAssigning(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Assign {vocab.members}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
