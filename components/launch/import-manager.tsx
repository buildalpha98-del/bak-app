"use client";

import React, { useState, useRef, ChangeEvent } from "react";
import { toast } from "sonner";
import {
  Upload, Download, CheckCircle2, AlertTriangle, XCircle,
  Building2, GraduationCap, Users, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  importCentres,
  importSchools,
  importCoaches,
} from "@/lib/launch/import-actions";
import type {
  CentreRow,
  SchoolRow,
  CoachRow,
  ImportResult,
} from "@/lib/launch/import-actions";

// ========================
// CSV Parser
// ========================

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l: string) => l.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseLine(lines[0]).map((h: string) => h.trim().toLowerCase().replace(/\s+/g, "_"));

  // Parse rows
  return lines.slice(1).map((line: string) => {
    const values = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h: string, i: number) => {
      obj[h] = (values[i] || "").trim();
    });
    return obj;
  });
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ========================
// Validation
// ========================

type RowStatus = "new" | "duplicate" | "error";

interface ValidatedRow<T> {
  data: T;
  status: RowStatus;
  error?: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDate(d: string): boolean {
  if (!d) return true; // Optional dates are valid when empty
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d).getTime());
}

function validateCentreRows(
  raw: Record<string, string>[],
  existingNames: Set<string>
): ValidatedRow<CentreRow>[] {
  return raw.map((r: Record<string, string>) => {
    const data: CentreRow = {
      centre_name: r.centre_name || "",
      address: r.address || "",
      suburb: r.suburb || "",
      state: r.state || "",
      postcode: r.postcode || "",
      contact_name: r.contact_name || "",
      contact_email: r.contact_email || "",
      contact_phone: r.contact_phone || "",
      session_day: r.session_day || undefined,
      session_time: r.session_time || undefined,
      session_rate: r.session_rate ? Number(r.session_rate) : undefined,
    };

    if (!data.centre_name) return { data, status: "error" as RowStatus, error: "Missing centre name" };
    if (data.contact_email && !isValidEmail(data.contact_email)) return { data, status: "error" as RowStatus, error: "Invalid email format" };
    if (existingNames.has(data.centre_name.toLowerCase())) return { data, status: "duplicate" as RowStatus };
    return { data, status: "new" as RowStatus };
  });
}

function validateSchoolRows(
  raw: Record<string, string>[],
  existingNames: Set<string>
): ValidatedRow<SchoolRow>[] {
  return raw.map((r: Record<string, string>) => {
    const data: SchoolRow = {
      school_name: r.school_name || "",
      address: r.address || "",
      suburb: r.suburb || "",
      state: r.state || "",
      postcode: r.postcode || "",
      contact_name: r.contact_name || "",
      contact_email: r.contact_email || "",
      contact_phone: r.contact_phone || "",
      students_enrolled: r.students_enrolled ? Number(r.students_enrolled) : undefined,
      term_start_date: r.term_start_date || undefined,
      session_day: r.session_day || undefined,
    };

    if (!data.school_name) return { data, status: "error" as RowStatus, error: "Missing school name" };
    if (data.contact_email && !isValidEmail(data.contact_email)) return { data, status: "error" as RowStatus, error: "Invalid email format" };
    if (data.term_start_date && !isValidDate(data.term_start_date)) return { data, status: "error" as RowStatus, error: "Invalid date format (use YYYY-MM-DD)" };
    if (existingNames.has(data.school_name.toLowerCase())) return { data, status: "duplicate" as RowStatus };
    return { data, status: "new" as RowStatus };
  });
}

function validateCoachRows(
  raw: Record<string, string>[],
  existingEmails: Set<string>
): ValidatedRow<CoachRow>[] {
  return raw.map((r: Record<string, string>) => {
    const data: CoachRow = {
      coach_name: r.coach_name || "",
      email: r.email || "",
      phone: r.phone || undefined,
      abn: r.abn || undefined,
      wwcc_number: r.wwcc_number || undefined,
      wwcc_expiry: r.wwcc_expiry || undefined,
      first_aid_expiry: r.first_aid_expiry || undefined,
    };

    if (!data.coach_name) return { data, status: "error" as RowStatus, error: "Missing coach name" };
    if (!data.email) return { data, status: "error" as RowStatus, error: "Missing email" };
    if (!isValidEmail(data.email)) return { data, status: "error" as RowStatus, error: "Invalid email format" };
    if (data.wwcc_expiry && !isValidDate(data.wwcc_expiry)) return { data, status: "error" as RowStatus, error: "Invalid WWCC expiry date" };
    if (data.first_aid_expiry && !isValidDate(data.first_aid_expiry)) return { data, status: "error" as RowStatus, error: "Invalid first aid expiry date" };
    if (existingEmails.has(data.email.toLowerCase())) return { data, status: "duplicate" as RowStatus };
    return { data, status: "new" as RowStatus };
  });
}

// ========================
// Status styling
// ========================

const STATUS_STYLE: Record<RowStatus, string> = {
  new: "bg-green-50",
  duplicate: "bg-amber-50",
  error: "bg-red-50",
};

const STATUS_ICON: Record<RowStatus, React.ReactNode> = {
  new: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  duplicate: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  error: <XCircle className="h-4 w-4 text-red-600" />,
};

// ========================
// Main Component
// ========================

export function ImportManager({ userId }: { userId: string }) {
  return (
    <Tabs defaultValue="centres">
      <TabsList>
        <TabsTrigger value="centres">
          <Building2 className="h-4 w-4 mr-1.5" />
          Centres
        </TabsTrigger>
        <TabsTrigger value="schools">
          <GraduationCap className="h-4 w-4 mr-1.5" />
          Schools
        </TabsTrigger>
        <TabsTrigger value="coaches">
          <Users className="h-4 w-4 mr-1.5" />
          Coaches
        </TabsTrigger>
      </TabsList>

      <TabsContent value="centres" className="mt-4">
        <CentreImport userId={userId} />
      </TabsContent>
      <TabsContent value="schools" className="mt-4">
        <SchoolImport userId={userId} />
      </TabsContent>
      <TabsContent value="coaches" className="mt-4">
        <CoachImport userId={userId} />
      </TabsContent>
    </Tabs>
  );
}

// ========================
// Centre Import Tab
// ========================

function CentreImport({ userId }: { userId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ValidatedRow<CentreRow>[] | null>(null);
  const [sendInvites, setSendInvites] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length === 0) {
      toast.error("CSV is empty or has invalid format");
      return;
    }

    // Get existing centre names for duplicate detection
    const existingNames = new Set<string>(); // Client-side approximation; server does final check
    setRows(validateCentreRows(parsed, existingNames));
    setResult(null);
  };

  const newCount = rows?.filter((r: ValidatedRow<CentreRow>) => r.status === "new").length ?? 0;

  const handleImport = async () => {
    if (!rows) return;
    const validRows = rows
      .filter((r: ValidatedRow<CentreRow>) => r.status === "new")
      .map((r: ValidatedRow<CentreRow>) => r.data);

    setImporting(true);
    const res = await importCentres({
      rows: validRows,
      sendInvitations: sendInvites,
      importedBy: userId,
    });
    setImporting(false);
    setResult(res);
    toast.success(`Created ${res.created} centres, invited ${res.invited}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Centres</CardTitle>
        <CardDescription>Upload a CSV file with childcare centre details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <a href="/templates/centres_template.csv" download>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1.5" />
              Download Template
            </Button>
          </a>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1.5" />
            Upload CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </div>

        {rows && rows.length > 0 && (
          <>
            <PreviewTable
              headers={["Name", "Address", "Contact", "Email", "Rate", "Status"]}
              rows={rows.map((r: ValidatedRow<CentreRow>) => ({
                status: r.status,
                error: r.error,
                cells: [
                  r.data.centre_name,
                  `${r.data.suburb} ${r.data.postcode}`.trim(),
                  r.data.contact_name,
                  r.data.contact_email,
                  r.data.session_rate ? `$${r.data.session_rate}` : "$165",
                ],
              }))}
            />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={sendInvites}
                  onCheckedChange={(c: boolean) => setSendInvites(c === true)}
                />
                Send invitation emails to contacts
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleImport} disabled={importing || newCount === 0}>
                {importing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Import {newCount} Centre{newCount !== 1 ? "s" : ""}
              </Button>
              <Summary rows={rows} />
            </div>
          </>
        )}

        {result && <ResultSummary result={result} />}
      </CardContent>
    </Card>
  );
}

// ========================
// School Import Tab
// ========================

function SchoolImport({ userId }: { userId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ValidatedRow<SchoolRow>[] | null>(null);
  const [sendInvites, setSendInvites] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length === 0) { toast.error("CSV is empty"); return; }
    setRows(validateSchoolRows(parsed, new Set()));
    setResult(null);
  };

  const newCount = rows?.filter((r: ValidatedRow<SchoolRow>) => r.status === "new").length ?? 0;

  const handleImport = async () => {
    if (!rows) return;
    const validRows = rows.filter((r: ValidatedRow<SchoolRow>) => r.status === "new").map((r: ValidatedRow<SchoolRow>) => r.data);
    setImporting(true);
    const res = await importSchools({ rows: validRows, sendInvitations: sendInvites, importedBy: userId });
    setImporting(false);
    setResult(res);
    toast.success(`Created ${res.created} schools, invited ${res.invited}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Schools</CardTitle>
        <CardDescription>Upload a CSV file with school details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <a href="/templates/schools_template.csv" download>
            <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" />Download Template</Button>
          </a>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1.5" />Upload CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </div>

        {rows && rows.length > 0 && (
          <>
            <PreviewTable
              headers={["Name", "Address", "Contact", "Email", "Students", "Status"]}
              rows={rows.map((r: ValidatedRow<SchoolRow>) => ({
                status: r.status,
                error: r.error,
                cells: [
                  r.data.school_name,
                  `${r.data.suburb} ${r.data.postcode}`.trim(),
                  r.data.contact_name,
                  r.data.contact_email,
                  r.data.students_enrolled?.toString() || "—",
                ],
              }))}
            />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={sendInvites} onCheckedChange={(c: boolean) => setSendInvites(c === true)} />
                Send invitation emails to contacts
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleImport} disabled={importing || newCount === 0}>
                {importing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Import {newCount} School{newCount !== 1 ? "s" : ""}
              </Button>
              <Summary rows={rows} />
            </div>
          </>
        )}

        {result && <ResultSummary result={result} />}
      </CardContent>
    </Card>
  );
}

// ========================
// Coach Import Tab
// ========================

function CoachImport({ userId }: { userId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ValidatedRow<CoachRow>[] | null>(null);
  const [sendInvites, setSendInvites] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length === 0) { toast.error("CSV is empty"); return; }
    setRows(validateCoachRows(parsed, new Set()));
    setResult(null);
  };

  const newCount = rows?.filter((r: ValidatedRow<CoachRow>) => r.status === "new").length ?? 0;

  const handleImport = async () => {
    if (!rows) return;
    const validRows = rows.filter((r: ValidatedRow<CoachRow>) => r.status === "new").map((r: ValidatedRow<CoachRow>) => r.data);
    setImporting(true);
    const res = await importCoaches({ rows: validRows, sendInvitations: sendInvites, importedBy: userId });
    setImporting(false);
    setResult(res);
    toast.success(`Created ${res.created} coaches, invited ${res.invited}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Coaches</CardTitle>
        <CardDescription>Upload a CSV file with coach details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <a href="/templates/coaches_template.csv" download>
            <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" />Download Template</Button>
          </a>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1.5" />Upload CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </div>

        {rows && rows.length > 0 && (
          <>
            <PreviewTable
              headers={["Name", "Email", "Phone", "ABN", "WWCC", "Status"]}
              rows={rows.map((r: ValidatedRow<CoachRow>) => ({
                status: r.status,
                error: r.error,
                cells: [
                  r.data.coach_name,
                  r.data.email,
                  r.data.phone || "—",
                  r.data.abn || "—",
                  r.data.wwcc_number || "—",
                ],
              }))}
            />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={sendInvites} onCheckedChange={(c: boolean) => setSendInvites(c === true)} />
                Send invitation emails to coaches
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleImport} disabled={importing || newCount === 0}>
                {importing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Import {newCount} Coach{newCount !== 1 ? "es" : ""}
              </Button>
              <Summary rows={rows} />
            </div>
          </>
        )}

        {result && <ResultSummary result={result} />}
      </CardContent>
    </Card>
  );
}

// ========================
// Shared: Preview Table
// ========================

function PreviewTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<{ status: RowStatus; error?: string; cells: string[] }>;
}) {
  return (
    <div className="border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
      <table className="w-full text-sm min-w-[680px]">
        <thead className="bg-muted/50 sticky top-0 z-10">
          <tr>
            <th className="px-3 py-2 text-left font-medium w-8"></th>
            {headers.map((h: string) => (
              <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i: number) => (
            <tr key={i} className={STATUS_STYLE[row.status]}>
              <td className="px-3 py-2">{STATUS_ICON[row.status]}</td>
              {row.cells.map((cell: string, j: number) => (
                <td key={j} className="px-3 py-2 truncate max-w-[200px]">{cell || "—"}</td>
              ))}
              {row.error && (
                <td className="px-3 py-2 text-xs text-red-600">{row.error}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ========================
// Shared: Summary badges
// ========================

function Summary<T>({ rows }: { rows: ValidatedRow<T>[] }) {
  const newCount = rows.filter((r: ValidatedRow<T>) => r.status === "new").length;
  const dupCount = rows.filter((r: ValidatedRow<T>) => r.status === "duplicate").length;
  const errCount = rows.filter((r: ValidatedRow<T>) => r.status === "error").length;

  return (
    <div className="flex gap-2 text-xs">
      {newCount > 0 && <Badge variant="outline" className="bg-green-50 text-green-700">{newCount} new</Badge>}
      {dupCount > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700">{dupCount} duplicate</Badge>}
      {errCount > 0 && <Badge variant="outline" className="bg-red-50 text-red-700">{errCount} error</Badge>}
    </div>
  );
}

// ========================
// Shared: Result summary
// ========================

function ResultSummary({ result }: { result: ImportResult }) {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <p className="text-sm font-medium">Import Complete</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          {result.created} created
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          {result.skipped} skipped
        </span>
        <span className="flex items-center gap-1.5">
          <Upload className="h-4 w-4 text-blue-600" />
          {result.invited} invited
        </span>
        {result.errors.length > 0 && (
          <span className="flex items-center gap-1.5">
            <XCircle className="h-4 w-4 text-red-600" />
            {result.errors.length} errors
          </span>
        )}
      </div>
      {result.errors.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Show errors
          </summary>
          <ul className="mt-1 text-xs text-red-600 space-y-0.5 ml-4 list-disc">
            {result.errors.map((e: { row: number; error: string }, i: number) => (
              <li key={i}>Row {e.row}: {e.error}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
