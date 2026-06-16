"use client";

// ============================================================
// Parent Bulk Invite — CSV upload + preview + dispatch
//
// Admin/Ops paste or upload a CSV of parents to onboard to the beta.
// Required columns: first_name, email. Optional: last_name, phone,
// referral_code_to_credit. Magic-link invites are sent via Resend.
// ============================================================

import { useState, useMemo, useTransition, useCallback, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  importParents,
  type ImportParentRow,
  type ImportParentsResult,
} from "@/lib/parent/actions";

// ============================================================
// Types
// ============================================================

interface ParsedRow {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  referral_code_to_credit: string;
}

type RowStatus = "new" | "duplicate" | "invalid_email" | "missing_name";

interface ValidatedRow extends ParsedRow {
  status: RowStatus;
  statusMessage: string;
}

type Step = "upload" | "preview" | "importing" | "summary";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COLUMN_HEADERS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "referral_code_to_credit",
] as const;

// ============================================================
// CSV parsing — hand-rolled (no papaparse in this project)
// ============================================================

function parseCsvLine(line: string): string[] {
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
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map(normaliseHeader);

  // Tolerant column aliases — "First Name", "Email Address", etc.
  const aliases: Record<string, string> = {
    firstname: "first_name",
    first: "first_name",
    given_name: "first_name",
    lastname: "last_name",
    last: "last_name",
    surname: "last_name",
    family_name: "last_name",
    email_address: "email",
    mail: "email",
    mobile: "phone",
    phone_number: "phone",
    contact_number: "phone",
    referral: "referral_code_to_credit",
    referral_code: "referral_code_to_credit",
  };

  const resolvedHeaders = headers.map((h) => aliases[h] ?? h);

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < resolvedHeaders.length; j++) {
      row[resolvedHeaders[j]] = values[j] ?? "";
    }
    rows.push({
      first_name: row.first_name ?? "",
      last_name: row.last_name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      referral_code_to_credit: row.referral_code_to_credit ?? "",
    });
  }

  return rows;
}

// ============================================================
// Component
// ============================================================

export function ParentCsvImportView() {
  const [step, setStep] = useState<Step>("upload");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [importResult, setImportResult] =
    useState<ImportParentsResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Client-side validation + intra-batch duplicate detection.
  // Server still does the authoritative DB duplicate check.
  const validatedRows = useMemo<ValidatedRow[]>(() => {
    const seenEmails = new Map<string, number>();
    return parsedRows.map((row, idx) => {
      const email = row.email.trim().toLowerCase();
      const firstName = row.first_name.trim();

      if (!firstName) {
        return {
          ...row,
          status: "missing_name" as const,
          statusMessage: "Missing first name",
        };
      }
      if (!email || !EMAIL_PATTERN.test(row.email.trim())) {
        return {
          ...row,
          status: "invalid_email" as const,
          statusMessage: "Invalid or missing email",
        };
      }

      const prevIdx = seenEmails.get(email);
      if (prevIdx !== undefined) {
        return {
          ...row,
          status: "duplicate" as const,
          statusMessage: `Duplicate of row ${prevIdx + 1} in this CSV`,
        };
      }
      seenEmails.set(email, idx);

      return {
        ...row,
        status: "new" as const,
        statusMessage: "Ready to invite",
      };
    });
  }, [parsedRows]);

  const newCount = validatedRows.filter((r) => r.status === "new").length;
  const duplicateCount = validatedRows.filter(
    (r) => r.status === "duplicate"
  ).length;
  const invalidCount = validatedRows.filter(
    (r) => r.status === "invalid_email" || r.status === "missing_name"
  ).length;

  const canSubmit = newCount > 0 && !isPending;

  // ----------------------------------------------------------
  // Handlers
  // ----------------------------------------------------------

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = (evt.target?.result as string) ?? "";
        const rows = parseCsv(text);
        setParsedRows(rows);
        setStep("preview");
      };
      reader.readAsText(file);
    },
    []
  );

  const handlePasteParse = () => {
    if (!pasteText.trim()) {
      toast.error("Paste a CSV first.");
      return;
    }
    const rows = parseCsv(pasteText);
    if (rows.length === 0) {
      toast.error("Couldn't parse any rows from that text.");
      return;
    }
    setFileName("(pasted CSV)");
    setParsedRows(rows);
    setStep("preview");
  };

  const handleImport = () => {
    startTransition(async () => {
      setStep("importing");
      setImportError(null);

      const payload: ImportParentRow[] = parsedRows.map((r) => ({
        first_name: r.first_name.trim(),
        last_name: r.last_name.trim() || undefined,
        email: r.email.trim(),
        phone: r.phone.trim() || undefined,
        referral_code_to_credit:
          r.referral_code_to_credit.trim() || undefined,
      }));

      const { data, error } = await importParents(payload, {
        skipDuplicates,
      });

      if (error) {
        setImportError(error);
        toast.error(error);
        setStep("preview");
        return;
      }

      setImportResult(data);
      const errorTail =
        data.errors.length > 0 ? `, ${data.errors.length} errored` : "";
      toast.success(
        `${data.created} invited, ${data.skipped} skipped${errorTail}.`
      );
      setStep("summary");
    });
  };

  const resetFlow = () => {
    setStep("upload");
    setParsedRows([]);
    setFileName("");
    setPasteText("");
    setImportResult(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          render={<Link href="/admin" />}
          aria-label="Back to parents"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Bulk Invite Parents
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload or paste a CSV to invite your existing parent base to the
            Build Alpha Kids beta. Each parent receives a magic-link sign-in
            email &mdash; no passwords required.
          </p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload", "preview", "summary"] as const).map((s, idx) => {
          const stepNames = ["Upload", "Preview", "Summary"];
          const order: Step[] = ["upload", "preview", "importing", "summary"];
          const isActive =
            s === step || (step === "importing" && s === "preview");
          const isPast = order.indexOf(step) > order.indexOf(s);
          return (
            <div key={s} className="flex items-center gap-2">
              {idx > 0 && <div className="h-px w-6 bg-border" />}
              <span
                className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isPast
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isPast ? <CheckCircle className="size-3.5" /> : idx + 1}
              </span>
              <span
                className={
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }
              >
                {stepNames[idx]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="rounded-full bg-muted p-4">
                <Upload className="size-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">Upload a CSV file</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Required: <code>first_name</code>, <code>email</code>.
                  Optional: <code>last_name</code>, <code>phone</code>,{" "}
                  <code>referral_code_to_credit</code>.
                </p>
              </div>
              <Label
                htmlFor="csv-file"
                className="cursor-pointer rounded-lg border-2 border-dashed border-border px-8 py-6 transition-colors hover:border-primary"
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="size-5 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {fileName || "Choose a CSV file"}
                  </span>
                </div>
                <Input
                  id="csv-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </Label>
            </div>
          </Card>

          <Card className="space-y-3 p-6">
            <div>
              <p className="font-medium text-foreground">Or paste CSV text</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Include the header row. We'll auto-recognise common variants
                like &ldquo;First Name&rdquo; or &ldquo;Email Address&rdquo;.
              </p>
            </div>
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`first_name,last_name,email,phone\nJane,Smith,jane@example.com,0412345678`}
              className="min-h-[160px] font-mono text-xs"
            />
            <Button onClick={handlePasteParse} disabled={!pasteText.trim()}>
              <ArrowRight className="size-4" />
              Parse pasted CSV
            </Button>
          </Card>
        </div>
      )}

      {/* Step: Preview */}
      {(step === "preview" || step === "importing") && (
        <div className="space-y-4">
          {importError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {importError}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
              <CheckCircle className="mr-1 size-3" />
              {newCount} new
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700">
              <AlertTriangle className="mr-1 size-3" />
              {duplicateCount} duplicate{duplicateCount === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline" className="bg-red-50 text-red-700">
              <XCircle className="mr-1 size-3" />
              {invalidCount} invalid
            </Badge>
            <span className="text-sm text-muted-foreground">
              {parsedRows.length} rows from {fileName}
            </span>
          </div>

          <Card className="space-y-3 p-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={skipDuplicates}
                onCheckedChange={(c) => setSkipDuplicates(!!c)}
              />
              <span>
                <strong>Skip duplicates</strong> &mdash; do not re-invite parents
                who already have an account.
              </span>
            </label>
          </Card>

          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Status</TableHead>
                  {COLUMN_HEADERS.map((c) => (
                    <TableHead key={c} className="whitespace-nowrap">
                      {c.replace(/_/g, " ")}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {validatedRows.slice(0, 100).map((row, idx) => (
                  <TableRow
                    key={idx}
                    className={
                      row.status === "invalid_email" ||
                      row.status === "missing_name"
                        ? "bg-red-50"
                        : row.status === "duplicate"
                          ? "bg-amber-50"
                          : ""
                    }
                  >
                    <TableCell>
                      {row.status === "new" && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle className="size-3.5" />
                          New
                        </span>
                      )}
                      {row.status === "duplicate" && (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-amber-600"
                          title={row.statusMessage}
                        >
                          <AlertTriangle className="size-3.5" />
                          Duplicate
                        </span>
                      )}
                      {row.status === "invalid_email" && (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-red-600"
                          title={row.statusMessage}
                        >
                          <XCircle className="size-3.5" />
                          Invalid email
                        </span>
                      )}
                      {row.status === "missing_name" && (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-red-600"
                          title={row.statusMessage}
                        >
                          <XCircle className="size-3.5" />
                          Missing name
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.first_name || (
                        <span className="italic text-red-400">Missing</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.last_name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.email || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.phone || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.referral_code_to_credit || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {validatedRows.length > 100 && (
              <p className="px-4 py-2 text-xs text-muted-foreground">
                Showing first 100 of {validatedRows.length} rows. All rows will
                still be processed on import.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={resetFlow}
              disabled={isPending}
            >
              <ArrowLeft className="size-4" />
              Start over
            </Button>
            <Button onClick={handleImport} disabled={!canSubmit}>
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending invites...
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Send {newCount} invite{newCount === 1 ? "" : "s"}
                </>
              )}
            </Button>
            {newCount === 0 && (
              <p className="self-center text-xs text-muted-foreground">
                No new rows to send. Fix invalid rows or upload a different
                CSV.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step: Summary */}
      {step === "summary" && importResult && (
        <div className="space-y-4">
          <Card className="space-y-6 p-8 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="size-8 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Invites dispatched
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Magic-link emails are on their way to every newly invited
                parent.
              </p>
            </div>

            <div className="mx-auto grid max-w-md grid-cols-3 gap-4">
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="text-2xl font-bold text-emerald-700">
                  {importResult.created}
                </p>
                <p className="text-xs text-emerald-600">Invited</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-4">
                <p className="text-2xl font-bold text-amber-700">
                  {importResult.skipped}
                </p>
                <p className="text-xs text-amber-600">Skipped</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-2xl font-bold text-red-700">
                  {importResult.errors.length}
                </p>
                <p className="text-xs text-red-600">Errored</p>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={resetFlow}>
                Import another CSV
              </Button>
              <Button render={<Link href="/admin" />}>
                Back to Admin
              </Button>
            </div>
          </Card>

          {importResult.errors.length > 0 && (
            <Card className="p-4">
              <details>
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Show {importResult.errors.length} error
                  {importResult.errors.length === 1 ? "" : "s"}
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Row</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResult.errors.map((e, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{e.row}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {e.email || "—"}
                          </TableCell>
                          <TableCell className="text-red-600">
                            {e.message}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
