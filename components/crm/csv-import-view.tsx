"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import Link from "@/components/ui/app-link";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { importLeadsFromCsv } from "@/lib/crm/actions";
import type { LeadStage } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

interface ParsedRow {
  centre_name: string;
  type: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  estimated_value: string;
  notes: string;
}

type RowStatus = "valid" | "duplicate" | "error";

interface ValidatedRow extends ParsedRow {
  status: RowStatus;
  statusMessage: string;
}

type Step = "upload" | "preview" | "options" | "importing" | "summary";

const EXPECTED_COLUMNS = [
  "centre_name",
  "type",
  "contact_name",
  "contact_email",
  "contact_phone",
  "address",
  "estimated_value",
  "notes",
] as const;

const STAGE_OPTIONS: { value: LeadStage; label: string }[] = [
  { value: "cold_lead", label: "Cold Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "free_trial", label: "Free Trial" },
  { value: "proposal_sent", label: "Proposal Sent" },
];

// ============================================================
// CSV Parsing
// ============================================================

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_")
  );

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push({
      centre_name: row.centre_name ?? "",
      type: row.type ?? "",
      contact_name: row.contact_name ?? "",
      contact_email: row.contact_email ?? "",
      contact_phone: row.contact_phone ?? "",
      address: row.address ?? "",
      estimated_value: row.estimated_value ?? "",
      notes: row.notes ?? "",
    });
  }

  return { headers, rows };
}

// ============================================================
// Component
// ============================================================

interface CsvImportViewProps {
  staffMembers: StaffMember[];
}

export function CsvImportView({ staffMembers }: CsvImportViewProps) {
  const [step, setStep] = useState<Step>("upload");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");

  // Options
  const [defaultStage, setDefaultStage] = useState<LeadStage>("cold_lead");
  const [defaultOwner, setDefaultOwner] = useState("");
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "create">("skip");

  // Results
  const [isPending, startTransition] = useTransition();
  const [importResult, setImportResult] = useState<{
    created: number;
    skipped: number;
    errors: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Validate rows (client-side duplicate check by centre_name)
  const validatedRows = useMemo<ValidatedRow[]>(() => {
    const seen = new Map<string, number>();
    return parsedRows.map((row, idx) => {
      if (!row.centre_name.trim()) {
        return {
          ...row,
          status: "error" as const,
          statusMessage: "Missing centre name",
        };
      }

      const key = row.centre_name.trim().toLowerCase();
      const prevIdx = seen.get(key);
      if (prevIdx !== undefined) {
        return {
          ...row,
          status: "duplicate" as const,
          statusMessage: `Potential duplicate of row ${prevIdx + 1}`,
        };
      }

      seen.set(key, idx);
      return {
        ...row,
        status: "valid" as const,
        statusMessage: "Ready to import",
      };
    });
  }, [parsedRows]);

  const validCount = validatedRows.filter((r) => r.status === "valid").length;
  const duplicateCount = validatedRows.filter((r) => r.status === "duplicate").length;
  const errorCount = validatedRows.filter((r) => r.status === "error").length;

  // File upload handler
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        const { headers, rows } = parseCsv(text);
        setRawHeaders(headers);
        setParsedRows(rows);
        setStep("preview");
      };
      reader.readAsText(file);
    },
    []
  );

  // Import handler
  const handleImport = () => {
    startTransition(async () => {
      setStep("importing");
      setImportError(null);

      const rows = parsedRows
        .filter((r) => r.centre_name.trim())
        .map((r) => ({
          centre_name: r.centre_name.trim(),
          type: r.type || undefined,
          contact_name: r.contact_name || undefined,
          contact_email: r.contact_email || undefined,
          contact_phone: r.contact_phone || undefined,
          address: r.address || undefined,
          estimated_value: r.estimated_value
            ? parseFloat(r.estimated_value)
            : undefined,
          notes: r.notes || undefined,
        }));

      const { data, error } = await importLeadsFromCsv(rows, {
        stage: defaultStage,
        owner_id: defaultOwner,
        duplicateAction,
      });

      if (error) {
        setImportError(error);
        setStep("options");
        return;
      }

      setImportResult(data);
      setStep("summary");
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          render={<Link href="/admin/crm" />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Import Leads from CSV
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload a CSV file to bulk-import leads into the pipeline
          </p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload", "preview", "options", "summary"] as const).map(
          (s, idx) => {
            const stepNames = ["Upload", "Preview", "Options", "Summary"];
            const isActive =
              s === step || (step === "importing" && s === "options");
            const isPast =
              ["upload", "preview", "options", "importing", "summary"].indexOf(
                step
              ) >
              ["upload", "preview", "options", "importing", "summary"].indexOf(
                s
              );
            return (
              <div key={s} className="flex items-center gap-2">
                {idx > 0 && (
                  <div className="h-px w-6 bg-border" />
                )}
                <span
                  className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isPast
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isPast ? (
                    <CheckCircle className="size-3.5" />
                  ) : (
                    idx + 1
                  )}
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
          }
        )}
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="rounded-full bg-muted p-4">
              <Upload className="size-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">
                Upload your CSV file
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Expected columns: centre_name, type, contact_name,
                contact_email, contact_phone, address, estimated_value, notes
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
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="sr-only"
              />
            </Label>
          </div>
        </Card>
      )}

      {/* Step: Preview */}
      {step === "preview" && (
        <div className="animate-fade-up space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-700"
            >
              <CheckCircle className="mr-1 size-3" />
              {validCount} valid
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700">
              <AlertTriangle className="mr-1 size-3" />
              {duplicateCount} potential duplicates
            </Badge>
            <Badge variant="outline" className="bg-red-50 text-red-700">
              <XCircle className="mr-1 size-3" />
              {errorCount} errors
            </Badge>
            <span className="text-sm text-muted-foreground">
              {parsedRows.length} rows from {fileName}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Status</TableHead>
                  {EXPECTED_COLUMNS.map((col) => (
                    <TableHead key={col} className="whitespace-nowrap">
                      {col.replace(/_/g, " ")}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {validatedRows.slice(0, 100).map((row, idx) => (
                  <TableRow
                    key={idx}
                    className={
                      row.status === "error"
                        ? "bg-red-50"
                        : row.status === "duplicate"
                          ? "bg-amber-50"
                          : ""
                    }
                  >
                    <TableCell>
                      {row.status === "valid" && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle className="size-3.5" />
                          Valid
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
                      {row.status === "error" && (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-red-600"
                          title={row.statusMessage}
                        >
                          <XCircle className="size-3.5" />
                          Error
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.centre_name || (
                        <span className="italic text-red-400">Missing</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.type || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.contact_name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.contact_email || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.contact_phone || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.address || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.estimated_value || "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {row.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {validatedRows.length > 100 && (
              <p className="px-4 py-2 text-xs text-muted-foreground">
                Showing first 100 of {validatedRows.length} rows
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("upload")}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <Button onClick={() => setStep("options")}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Options */}
      {(step === "options" || step === "importing") && (
        <div className="animate-fade-up space-y-6">
          {importError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {importError}
            </div>
          )}

          <Card className="space-y-4 p-6">
            <h2 className="text-lg font-medium text-foreground">
              Import Options
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="default-stage">Default Stage</Label>
                <Select
                  value={defaultStage}
                  onValueChange={(v) =>
                    setDefaultStage((v ?? "cold_lead") as LeadStage)
                  }
                >
                  <SelectTrigger id="default-stage">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default-owner">Default Owner</Label>
                <Select
                  value={defaultOwner}
                  onValueChange={(v) => setDefaultOwner(v ?? "")}
                >
                  <SelectTrigger id="default-owner">
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffMembers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Duplicate Handling</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="duplicate"
                    checked={duplicateAction === "skip"}
                    onChange={() => setDuplicateAction("skip")}
                    className="accent-primary"
                  />
                  Skip duplicates
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="duplicate"
                    checked={duplicateAction === "create"}
                    onChange={() => setDuplicateAction("create")}
                    className="accent-primary"
                  />
                  Create anyway
                </label>
              </div>
            </div>
          </Card>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setStep("preview")}
              disabled={isPending}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <Button
              onClick={handleImport}
              disabled={isPending || !defaultOwner}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="size-4" />
                  Import {parsedRows.length} Leads
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Summary */}
      {step === "summary" && importResult && (
        <div className="animate-fade-up">
          <Card className="space-y-6 p-8 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="size-8 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Import Complete
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your CSV has been processed successfully
              </p>
            </div>

            <div className="mx-auto grid max-w-sm grid-cols-3 gap-4">
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="text-2xl font-bold text-emerald-700">
                  {importResult.created}
                </p>
                <p className="text-xs text-emerald-600">Created</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-4">
                <p className="text-2xl font-bold text-amber-700">
                  {importResult.skipped}
                </p>
                <p className="text-xs text-amber-600">Skipped</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-2xl font-bold text-red-700">
                  {importResult.errors}
                </p>
                <p className="text-xs text-red-600">Errors</p>
              </div>
            </div>

            <Button render={<Link href="/admin/crm" />}>
              Back to Pipeline
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
