"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { importQuickBooksInvoices } from "@/lib/outbound-invoicing/import-actions";

interface ParsedInvoice {
  invoice_number: string;
  centre_name: string;
  amount: number;
  date: string;
  due_date: string;
}

function parseCSV(text: string): ParsedInvoice[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const numberIdx = headers.findIndex((h) =>
    h.includes("invoice") && h.includes("number")
  );
  const centreIdx = headers.findIndex(
    (h) => h.includes("centre") || h.includes("customer")
  );
  const amountIdx = headers.findIndex(
    (h) => h.includes("amount") || h.includes("total")
  );
  const dateIdx = headers.findIndex(
    (h) => h === "date" || h.includes("invoice date")
  );
  const dueIdx = headers.findIndex((h) => h.includes("due"));

  if (numberIdx === -1 || centreIdx === -1 || amountIdx === -1) return [];

  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return {
      invoice_number: cols[numberIdx] || "",
      centre_name: cols[centreIdx] || "",
      amount: parseFloat(cols[amountIdx]) || 0,
      date: cols[dateIdx] || new Date().toISOString().split("T")[0],
      due_date:
        cols[dueIdx] || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
    };
  }).filter((inv) => inv.invoice_number && inv.amount > 0);
}

export default function ImportInvoicesPage() {
  const [parsed, setParsed] = useState<ParsedInvoice[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const invoices = parseCSV(text);
      if (invoices.length === 0) {
        toast.error("No valid invoices found in the CSV. Expected columns: invoice_number, centre/customer, amount/total, date, due_date");
        return;
      }
      setParsed(invoices);
      toast.success(`Parsed ${invoices.length} invoice(s) from CSV.`);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    const { error } = await importQuickBooksInvoices(parsed);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`Successfully imported ${parsed.length} invoice(s).`);
      setImported(true);
    }
    setImporting(false);
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Import QuickBooks Invoices
        </h1>
        <p className="text-sm text-muted-foreground">
          One-time import of open invoices from QuickBooks. Upload a CSV export of unpaid invoices.
        </p>
      </div>

      {imported ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <h2 className="text-lg font-semibold">Import Complete</h2>
            <p className="text-muted-foreground text-center max-w-md">
              {parsed.length} invoice(s) have been imported. You can now manage
              them from the outbound invoicing page. QuickBooks can be fully
              decommissioned.
            </p>
            <Button
              onClick={() => (window.location.href = "/admin/invoicing/outbound")}
              className="bg-primary hover:bg-primary/90"
            >
              Go to Invoicing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-5 w-5" />
                Upload CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center">
                <FileText className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-2 text-sm text-muted-foreground">
                  CSV with columns: invoice_number, centre/customer, amount/total, date, due_date
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => fileRef.current?.click()}
                >
                  Choose File
                </Button>
              </div>
            </CardContent>
          </Card>

          {parsed.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Preview ({parsed.length} invoices)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                        <th className="px-3 py-2">Invoice #</th>
                        <th className="px-3 py-2">Centre</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Due Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {parsed.map((inv, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-mono text-xs">
                            {inv.invoice_number}
                          </td>
                          <td className="px-3 py-2">{inv.centre_name}</td>
                          <td className="px-3 py-2 text-right font-medium">
                            ${inv.amount.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{inv.date}</td>
                          <td className="px-3 py-2 text-gray-500">
                            {inv.due_date}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <Button
                    onClick={handleImport}
                    disabled={importing}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {importing ? "Importing..." : `Import ${parsed.length} Invoice(s)`}
                  </Button>
                  <div className="flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    This is a one-time operation. Invoices will be created as &quot;sent&quot; status.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
