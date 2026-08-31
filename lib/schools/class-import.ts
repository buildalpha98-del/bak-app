import { yearGroupToAgeBand } from "@/lib/schools/year-groups";

// CSV class-list import (pure parsing/matching — no IO). Schools export
// "student, year, class, teacher" from their SIS; this turns that file
// into a reviewable plan: classes to create/update and child→class
// assignments against the centre's enrolled roster. Design:
// docs/superpowers/specs/2026-08-26-school-classes-design.md ("Data entry").

export interface ParsedClassRow {
  /** 1-based data line number (header excluded) for error reporting. */
  line: number;
  studentName: string;
  firstName: string;
  lastName: string;
  className: string;
  yearGroup: string;
  teacherName: string | null;
  /** ISO date when the file carries a parseable DOB column; else null. */
  dateOfBirth: string | null;
}

export interface ClassImportParseResult {
  rows: ParsedClassRow[];
  errors: { line: number; message: string }[];
}

export interface RosterChildLite {
  child_id: string;
  first_name: string;
  last_name: string;
}

export interface ExistingClassLite {
  id: string;
  name: string;
  year_group: string;
  teacher_name: string | null;
}

export interface PlannedCreation {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  /** Platform age band derived from the class's year group. */
  ageGroup: "5-8" | "8-12";
  className: string;
}

export interface ClassImportPlan {
  classes: {
    name: string;
    year_group: string;
    teacher_name: string | null;
    /** Matching class already on file for this school year, if any. */
    existing_id: string | null;
  }[];
  assignments: { child_id: string; className: string }[];
  /** New students to create + enrol (createMissing only); deduped by name+DOB. */
  creations: PlannedCreation[];
  unmatched: ParsedClassRow[];
  ambiguous: { row: ParsedClassRow; candidates: RosterChildLite[] }[];
  warnings: string[];
}

/**
 * Normalise free-text year groups: "Kindy" → "K", "Year 3" → "3",
 * "5-6" → "5/6". Returns null when nothing year-like remains.
 */
export function normaliseYearGroup(input: string): string | null {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/\b(YEAR|YR|GRADE)\b\.?/g, "")
    .trim();
  if (/^KIND/.test(cleaned)) return "K";
  const tokens = cleaned.split(/[^0-9K]+/).filter(Boolean);
  const parts = tokens
    .map((t) => (t === "K" ? "K" : /^[0-6]$/.test(t) ? t : null))
    .filter((t): t is string => t !== null);
  if (parts.length === 0) return null;
  return parts.join("/");
}

/** "3B" → "3", "KM" → "K", "5/6M" → "5/6" — the leading year token(s) of a
 *  class name. Lookaheads reject multi-digit years ("12B") rather than
 *  silently reading them as year 1. */
function yearGroupFromClassName(className: string): string | null {
  const match = className
    .trim()
    .toUpperCase()
    .match(/^(K|[1-6](?!\d))([/\-](K|[1-6](?!\d)))?/);
  if (!match) return null;
  return match[3] ? `${match[1]}/${match[3]}` : match[1];
}

/**
 * Parse a DOB cell to ISO. Accepts DD/MM/YYYY (how Australian SIS exports
 * write dates) and YYYY-MM-DD; anything else → null — DOB is auxiliary,
 * never worth failing a row over.
 */
function parseDob(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const au = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  let y: number, m: number, d: number;
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (au) {
    [d, m, y] = [Number(au[1]), Number(au[2]), Number(au[3])];
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Minimal quote-aware CSV: handles quoted fields, embedded commas, doubled quotes. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

interface HeaderMap {
  fullName: number | null;
  firstName: number | null;
  lastName: number | null;
  year: number | null;
  className: number | null;
  teacher: number | null;
  dob: number | null;
}

function mapHeader(cells: string[]): HeaderMap | null {
  const map: HeaderMap = {
    fullName: null,
    firstName: null,
    lastName: null,
    year: null,
    className: null,
    teacher: null,
    dob: null,
  };
  cells.forEach((raw, i) => {
    const h = raw.toLowerCase().replace(/[^a-z ]/g, "").trim();
    if (/^(first ?name|given ?name)$/.test(h)) map.firstName = i;
    else if (/^(last ?name|surname|family ?name)$/.test(h)) map.lastName = i;
    else if (/^(student ?name|student|child ?name|child|name|full ?name)$/.test(h)) map.fullName = i;
    else if (/^(year ?group|year|grade|yr)$/.test(h)) map.year = i;
    else if (/^(class ?name|class|roll ?class|home ?class)$/.test(h)) map.className = i;
    else if (/^(class ?teacher|teacher ?name|teacher)$/.test(h)) map.teacher = i;
    else if (/^(dob|date ?of ?birth|birth ?date|birthdate)$/.test(h)) map.dob = i;
  });
  const hasName = map.fullName !== null || (map.firstName !== null && map.lastName !== null);
  if (!hasName || map.className === null) return null;
  return map;
}

/** "Ava Nguyen" or "Nguyen, Ava" → { first, last }. */
function splitStudentName(name: string): { first: string; last: string } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.includes(",")) {
    const [last, first] = trimmed.split(",").map((p) => p.trim());
    return { first: first ?? "", last: last ?? "" };
  }
  const parts = trimmed.split(" ");
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export function parseClassListCsv(text: string): ClassImportParseResult {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r\n|\r|\n/)
    .map((l) => l.replace(/^﻿/, ""));

  let header: HeaderMap | null = null;
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    header = mapHeader(splitCsvLine(lines[i]));
    headerIndex = i;
    break;
  }
  if (!header) {
    return {
      rows: [],
      errors: [
        {
          line: 0,
          message:
            "Couldn't find a recognisable header row. Expected columns like: Student name, Year, Class, Teacher.",
        },
      ],
    };
  }

  const rows: ParsedClassRow[] = [];
  const errors: { line: number; message: string }[] = [];
  let dataLine = 0;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    dataLine++;
    const cells = splitCsvLine(lines[i]);
    const get = (idx: number | null) => (idx !== null ? (cells[idx] ?? "").trim() : "");

    let first = get(header.firstName);
    let last = get(header.lastName);
    let studentName = `${first} ${last}`.trim();
    if (header.fullName !== null && !first && !last) {
      studentName = get(header.fullName);
      const split = splitStudentName(studentName);
      first = split.first;
      last = split.last;
      studentName = `${first} ${last}`.trim();
    }
    const className = get(header.className);

    if (!studentName) {
      errors.push({ line: dataLine, message: "Missing student name." });
      continue;
    }
    if (!className) {
      errors.push({ line: dataLine, message: `Missing class for ${studentName}.` });
      continue;
    }

    const rawYear = get(header.year);
    const yearGroup =
      (rawYear ? normaliseYearGroup(rawYear) : null) ?? yearGroupFromClassName(className);
    if (!yearGroup) {
      errors.push({
        line: dataLine,
        message: `Couldn't work out a year group for ${studentName} (class "${className}"${rawYear ? `, year "${rawYear}"` : ""}).`,
      });
      continue;
    }

    const teacher = get(header.teacher);
    rows.push({
      line: dataLine,
      studentName,
      firstName: first,
      lastName: last,
      className,
      yearGroup,
      teacherName: teacher || null,
      dateOfBirth: header.dob !== null ? parseDob(get(header.dob)) : null,
    });
  }
  return { rows, errors };
}

const nameKey = (first: string, last: string) =>
  `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}`;

/**
 * Turn parsed rows into a reviewable plan against the centre's enrolled
 * roster and existing classes. Never guesses: duplicate roster names are
 * surfaced as ambiguous, unknown names as unmatched — unless
 * `createMissing` is on, in which case unmatched rows become planned
 * creations (new student + enrolment + class membership in one commit),
 * deduped by name + DOB.
 */
export function buildClassImportPlan(
  rows: ParsedClassRow[],
  roster: RosterChildLite[],
  existingClasses: ExistingClassLite[],
  opts: { createMissing?: boolean } = {}
): ClassImportPlan {
  const rosterByName = new Map<string, RosterChildLite[]>();
  for (const child of roster) {
    const key = nameKey(child.first_name, child.last_name);
    const list = rosterByName.get(key) ?? [];
    list.push(child);
    rosterByName.set(key, list);
  }
  const existingByName = new Map(existingClasses.map((c) => [c.name.toLowerCase(), c]));

  const classes = new Map<string, ClassImportPlan["classes"][number]>();
  const assignments: ClassImportPlan["assignments"] = [];
  const creations: PlannedCreation[] = [];
  const creationByKey = new Map<string, PlannedCreation>();
  const unmatched: ParsedClassRow[] = [];
  const ambiguous: ClassImportPlan["ambiguous"] = [];
  const warnings: string[] = [];
  const warned = new Set<string>();

  const assignedChildClass = new Map<string, string>();

  for (const row of rows) {
    const clsKey = row.className.toLowerCase();
    const existing = existingByName.get(clsKey) ?? null;
    let cls = classes.get(clsKey);
    if (!cls) {
      // For a class already on file, the plan carries what will actually
      // be in effect after commit (commit never changes year_group and
      // only fills a missing teacher) — the preview must not overstate.
      cls = {
        name: existing?.name ?? row.className,
        year_group: existing?.year_group ?? row.yearGroup,
        teacher_name: existing?.teacher_name ?? row.teacherName,
        existing_id: existing?.id ?? null,
      };
      classes.set(clsKey, cls);
      if (existing && existing.year_group !== row.yearGroup) {
        warnings.push(
          `Class "${existing.name}" is on file as Year ${existing.year_group} but the file says Year ${row.yearGroup} — keeping Year ${existing.year_group}.`
        );
      }
      if (
        existing?.teacher_name &&
        row.teacherName &&
        existing.teacher_name.toLowerCase() !== row.teacherName.toLowerCase()
      ) {
        warnings.push(
          `Class "${existing.name}" already has teacher ${existing.teacher_name} on file — the file's "${row.teacherName}" won't overwrite it.`
        );
      }
    } else {
      if (cls.year_group !== row.yearGroup && !warned.has(`y:${clsKey}`)) {
        warned.add(`y:${clsKey}`);
        warnings.push(
          `Class "${cls.name}" appears with two year groups ("${cls.year_group}" and "${row.yearGroup}") — keeping "${cls.year_group}".`
        );
      }
      if (!cls.teacher_name && row.teacherName) {
        cls.teacher_name = row.teacherName;
      } else if (
        cls.teacher_name &&
        row.teacherName &&
        cls.teacher_name.toLowerCase() !== row.teacherName.toLowerCase() &&
        !warned.has(`t:${clsKey}`)
      ) {
        warned.add(`t:${clsKey}`);
        warnings.push(
          `Class "${cls.name}" appears with two teachers ("${cls.teacher_name}" and "${row.teacherName}") — keeping "${cls.teacher_name}".`
        );
      }
    }

    const candidates = rosterByName.get(nameKey(row.firstName, row.lastName)) ?? [];
    if (candidates.length === 1) {
      // The same student on two rows: first class wins; a second row
      // naming a different class is a data problem worth surfacing.
      const prior = assignedChildClass.get(candidates[0].child_id);
      if (prior !== undefined) {
        if (prior.toLowerCase() !== cls.name.toLowerCase()) {
          warnings.push(
            `${row.studentName} appears in both "${prior}" and "${cls.name}" — keeping "${prior}".`
          );
        }
        continue;
      }
      assignedChildClass.set(candidates[0].child_id, cls.name);
      assignments.push({ child_id: candidates[0].child_id, className: cls.name });
    } else if (candidates.length > 1) {
      ambiguous.push({ row, candidates });
    } else if (opts.createMissing) {
      const key = `${nameKey(row.firstName, row.lastName)}|${row.dateOfBirth ?? ""}`;
      const prior = creationByKey.get(key);
      if (prior) {
        if (prior.className.toLowerCase() !== cls.name.toLowerCase()) {
          warnings.push(
            `${row.studentName} appears in both "${prior.className}" and "${cls.name}" — keeping "${prior.className}".`
          );
        }
        continue;
      }
      const creation: PlannedCreation = {
        firstName: row.firstName,
        lastName: row.lastName,
        dateOfBirth: row.dateOfBirth,
        // Band follows the effective class year (DB value for an
        // existing class), matching what assignChildrenToClass derives.
        ageGroup: yearGroupToAgeBand(cls.year_group),
        className: cls.name,
      };
      creationByKey.set(key, creation);
      creations.push(creation);
    } else {
      unmatched.push(row);
    }
  }

  return {
    classes: [...classes.values()],
    assignments,
    creations,
    unmatched,
    ambiguous,
    warnings,
  };
}
