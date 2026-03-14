"use client";

import { useState, useTransition, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

import {
  importChildren,
  type ImportChildRow,
  type ImportResult,
} from "@/lib/children/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CsvImportViewProps {
  centres: { id: string; name: string }[];
  basePath: string;
}

type AgeGroup = "3-5" | "5-8" | "8-12";

const VALID_AGE_GROUPS: AgeGroup[] = ["3-5", "5-8", "8-12"];

interface ParsedRow extends ImportChildRow {
  _rowIndex: number;
  _errors: string[];
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/** Parse a single CSV line handling quoted values that may contain commas. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote ""
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Map a header label (case-insensitive) to an ImportChildRow key. */
const HEADER_MAP: Record<string, keyof ImportChildRow> = {
  first_name: "first_name",
  firstname: "first_name",
  "first name": "first_name",
  last_name: "last_name",
  lastname: "last_name",
  "last name": "last_name",
  date_of_birth: "date_of_birth",
  dateofbirth: "date_of_birth",
  "date of birth": "date_of_birth",
  dob: "date_of_birth",
  age_group: "age_group",
  agegroup: "age_group",
  "age group": "age_group",
  gender: "gender",
  medical_notes: "medical_notes",
  medicalnotes: "medical_notes",
  "medical notes": "medical_notes",
  parent_name: "parent_name",
  parentname: "parent_name",
  "parent name": "parent_name",
  parent_phone: "parent_phone",
  parentphone: "parent_phone",
  "parent phone": "parent_phone",
  parent_email: "parent_email",
  parentemail: "parent_email",
  "parent email": "parent_email",
};

function parseCsv(text: string): { rows: ParsedRow[]; unmappedHeaders: string[] } {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) return { rows: [], unmappedHeaders: [] };

  const headerFields = parseCsvLine(lines[0]);
  const columnMapping: (keyof ImportChildRow | null)[] = headerFields.map(
    (h) => HEADER_MAP[h.toLowerCase().trim()] ?? null
  );
  const unmappedHeaders = headerFields.filter(
    (_, i) => columnMapping[i] === null
  );

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};

    columnMapping.forEach((key, colIdx) => {
      if (key && colIdx < fields.length) {
        row[key] = fields[colIdx];
      }
    });

    // Validate
    const errors: string[] = [];
    if (!row.first_name) errors.push("Missing first name");
    if (!row.last_name) errors.push("Missing last name");
    if (!row.age_group) {
      errors.push("Missing age group");
    } else if (!VALID_AGE_GROUPS.includes(row.age_group as AgeGroup)) {
      errors.push(`Invalid age group "${row.age_group}" — must be 3-5, 5-8, or 8-12`);
    }

    rows.push({
      first_name: row.first_name ?? "",
      last_name: row.last_name ?? "",
      date_of_birth: row.date_of_birth || undefined,
      age_group: (row.age_group as AgeGroup) ?? ("3-5" as AgeGroup),
      gender: row.gender || undefined,
      medical_notes: row.medical_notes || undefined,
      parent_name: row.parent_name || undefined,
      parent_phone: row.parent_phone || undefined,
      parent_email: row.parent_email || undefined,
      _rowIndex: i,
      _errors: errors,
    });
  }

  return { rows, unmappedHeaders };
}

// ---------------------------------------------------------------------------
// Steps indicator
// ---------------------------------------------------------------------------

const STEPS = ["Upload", "Preview", "Results"] as const;

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-centre gap-2 mb-6">
      {STEPS.map((label, idx) => {
        const isActive = idx === current;
        const isComplete = idx < current;
        return (
          <div key={label} className="flex items-center gap-2">
            {idx > 0 && (
              <div
                className={`h-px w-6 sm:w-10 ${
                  isComplete ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isComplete
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isComplete ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`hidden sm:inline text-sm ${
                  isActive ? "font-medium" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CsvImportView({ centres, basePath }: CsvImportViewProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [centreId, setCentreId] = useState<string>("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [unmappedHeaders, setUnmappedHeaders] = useState<string[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const validRows = rows.filter((r) => r._errors.length === 0);
  const errorRows = rows.filter((r) => r._errors.length > 0);

  // -- Step 1: file selection -----------------------------------------------

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.toLowerCase().endsWith(".csv")) {
        toast.error("Please select a CSV file.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const parsed = parseCsv(text);

        if (parsed.rows.length === 0) {
          toast.error("No data rows found in the CSV file.");
          return;
        }

        setRows(parsed.rows);
        setUnmappedHeaders(parsed.unmappedHeaders);

        if (parsed.unmappedHeaders.length > 0) {
          toast.warning(
            `Unmapped columns ignored: ${parsed.unmappedHeaders.join(", ")}`
          );
        }

        setStep(1);
      };
      reader.readAsText(file);
    },
    []
  );

  // -- Step 2: import -------------------------------------------------------

  const handleImport = useCallback(() => {
    if (!centreId) {
      toast.error("Please select a centre.");
      return;
    }
    if (validRows.length === 0) {
      toast.error("No valid rows to import.");
      return;
    }

    startTransition(async () => {
      // Strip internal fields before sending
      const payload: ImportChildRow[] = validRows.map(
        ({ _rowIndex, _errors, ...rest }) => rest
      );

      const { data, error } = await importChildren(
        payload,
        centreId,
        skipDuplicates
      );

      if (error) {
        toast.error(error);
        return;
      }

      setResult(data);
      setStep(2);
      toast.success(
        `Import complete — ${data?.created ?? 0} children created.`
      );
    });
  }, [centreId, validRows, skipDuplicates]);

  // -- Render ---------------------------------------------------------------

  return (
    <div className="space-y-4">
      <StepIndicator current={step} />

      {/* ------------------------------------------------------------------ */}
      {/* Step 1 — Upload                                                     */}
      {/* ------------------------------------------------------------------ */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload CSV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Centre</Label>
              <Select value={centreId} onValueChange={(v) => setCentreId(v ?? "")}>
                <SelectTrigger className="w-full min-h-[44px]">
                  <SelectValue placeholder="Select centre..." />
                </SelectTrigger>
                <SelectContent>
                  {centres.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>CSV File</Label>
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    fileInputRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <FileText className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  Click to select a CSV file
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Columns: first_name, last_name, age_group (required) + date_of_birth, gender, medical_notes, parent_name, parent_phone, parent_email
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {!centreId && (
              <p className="text-sm text-muted-foreground">
                Please select a centre before uploading.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 2 — Preview                                                    */}
      {/* ------------------------------------------------------------------ */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Preview Import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-sm">
                {validRows.length} valid row{validRows.length !== 1 ? "s" : ""}
              </Badge>
              {errorRows.length > 0 && (
                <Badge variant="destructive" className="text-sm">
                  {errorRows.length} error{errorRows.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>First Name</TableHead>
                    <TableHead>Last Name</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>Age Group</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead className="hidden sm:table-cell">Medical Notes</TableHead>
                    <TableHead className="hidden md:table-cell">Parent Name</TableHead>
                    <TableHead className="hidden md:table-cell">Parent Phone</TableHead>
                    <TableHead className="hidden lg:table-cell">Parent Email</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const hasErrors = row._errors.length > 0;
                    return (
                      <TableRow
                        key={row._rowIndex}
                        className={hasErrors ? "bg-destructive/10" : ""}
                      >
                        <TableCell className="text-muted-foreground text-xs">
                          {row._rowIndex}
                        </TableCell>
                        <TableCell>{row.first_name || "—"}</TableCell>
                        <TableCell>{row.last_name || "—"}</TableCell>
                        <TableCell>{row.date_of_birth || "—"}</TableCell>
                        <TableCell>{row.age_group || "—"}</TableCell>
                        <TableCell>{row.gender || "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {row.medical_notes || "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {row.parent_name || "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {row.parent_phone || "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {row.parent_email || "—"}
                        </TableCell>
                        <TableCell>
                          {hasErrors ? (
                            <span
                              className="text-destructive text-xs"
                              title={row._errors.join("; ")}
                            >
                              <AlertCircle className="inline h-3.5 w-3.5 mr-1" />
                              {row._errors[0]}
                            </span>
                          ) : (
                            <span className="text-xs text-green-600">Valid</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Options */}
            <div className="flex items-center gap-2">
              <Checkbox
                checked={skipDuplicates}
                onCheckedChange={(checked) =>
                  setSkipDuplicates(Boolean(checked))
                }
                id="skip-duplicates"
              />
              <Label htmlFor="skip-duplicates" className="cursor-pointer text-sm">
                Skip duplicates (children already enrolled at this centre)
              </Label>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={() => {
                  setStep(0);
                  setRows([]);
                  setUnmappedHeaders([]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                Back
              </Button>
              <Button
                className="min-h-[44px]"
                disabled={validRows.length === 0 || isPending || !centreId}
                onClick={handleImport}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  `Import ${validRows.length} Children`
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 3 — Results                                                    */}
      {/* ------------------------------------------------------------------ */}
      {step === 2 && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border p-4 text-centre">
                <p className="text-2xl font-bold text-green-600">
                  {result.created}
                </p>
                <p className="text-sm text-muted-foreground">Children created</p>
              </div>
              <div className="rounded-lg border p-4 text-centre">
                <p className="text-2xl font-bold text-amber-600">
                  {result.skipped}
                </p>
                <p className="text-sm text-muted-foreground">
                  Skipped (duplicates)
                </p>
              </div>
              <div className="rounded-lg border p-4 text-centre">
                <p className="text-2xl font-bold text-destructive">
                  {result.errors.length}
                </p>
                <p className="text-sm text-muted-foreground">Errors</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Error details:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {result.errors.map((err, idx) => (
                    <li key={idx} className="text-sm text-destructive">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              className="min-h-[44px]"
              onClick={() => router.push(basePath)}
            >
              Back to Children
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
