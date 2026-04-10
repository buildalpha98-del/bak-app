"use client";

import React, { useState, ChangeEvent } from "react";
import { toast } from "sonner";
import {
  FileText, Download, Send, CheckCircle2, Clock, AlertCircle,
  Eye, DollarSign, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  createCentreInvoice,
  createSchoolInvoice,
  updateInvoiceStatus,
  getInvoicePdfUrl,
  previewCentreInvoice,
  previewSchoolInvoice,
} from "@/lib/launch/invoice-actions";
import type { InvoiceWithItems } from "@/lib/launch/invoice-actions";
import type { CentreInvoiceCalculation, SchoolInvoiceCalculation } from "@/lib/launch/types";

// ========================
// Helpers
// ========================

function fmt(n: number): string {
  return `$${Number(n).toFixed(2)}`;
}

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function getFriday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -1 : 5 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

const STATUS_BADGE: Record<string, { variant: "secondary" | "default" | "destructive" | "outline"; label: string }> = {
  draft: { variant: "secondary", label: "Draft" },
  sent: { variant: "default", label: "Sent" },
  paid: { variant: "outline", label: "Paid" },
  overdue: { variant: "destructive", label: "Overdue" },
};

// ========================
// Main Component
// ========================

export function InvoiceManager({
  centres,
  schools,
  initialInvoices,
  userId,
}: {
  centres: Array<{ id: string; name: string }>;
  schools: Array<{ id: string; name: string }>;
  initialInvoices: InvoiceWithItems[];
  userId: string;
}) {
  const [invoices, setInvoices] = useState(initialInvoices);

  // Summary stats
  const outstanding = invoices
    .filter((i: InvoiceWithItems) => i.status === "sent")
    .reduce((s: number, i: InvoiceWithItems) => s + Number(i.total), 0);
  const overdue = invoices
    .filter((i: InvoiceWithItems) => i.status === "overdue")
    .reduce((s: number, i: InvoiceWithItems) => s + Number(i.total), 0);
  const paidThisMonth = invoices
    .filter((i: InvoiceWithItems) => {
      if (i.status !== "paid") return false;
      const now = new Date();
      const pd = i.payment_date ? new Date(i.payment_date) : null;
      return pd && pd.getMonth() === now.getMonth() && pd.getFullYear() === now.getFullYear();
    })
    .reduce((s: number, i: InvoiceWithItems) => s + Number(i.total), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-xl font-bold">{fmt(outstanding)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Paid This Month</p>
                <p className="text-xl font-bold">{fmt(paidThisMonth)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-xl font-bold">{fmt(overdue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generate Invoice */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="centre">
            <TabsList>
              <TabsTrigger value="centre">Childcare Centre</TabsTrigger>
              <TabsTrigger value="school">School</TabsTrigger>
            </TabsList>

            <TabsContent value="centre" className="mt-4">
              <CentreInvoiceForm
                centres={centres}
                userId={userId}
                onCreated={(inv: InvoiceWithItems) => setInvoices((prev: InvoiceWithItems[]) => [inv, ...prev])}
              />
            </TabsContent>

            <TabsContent value="school" className="mt-4">
              <SchoolInvoiceForm
                schools={schools}
                userId={userId}
                onCreated={(inv: InvoiceWithItems) => setInvoices((prev: InvoiceWithItems[]) => [inv, ...prev])}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Invoice List */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceList invoices={invoices} onUpdate={setInvoices} />
        </CardContent>
      </Card>
    </div>
  );
}

// ========================
// Centre Invoice Form
// ========================

function CentreInvoiceForm({
  centres,
  userId,
  onCreated,
}: {
  centres: Array<{ id: string; name: string }>;
  userId: string;
  onCreated: (inv: InvoiceWithItems) => void;
}) {
  const [centreId, setCentreId] = useState("");
  const [startDate, setStartDate] = useState(getMonday());
  const [endDate, setEndDate] = useState(getFriday());
  const [preview, setPreview] = useState<CentreInvoiceCalculation | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handlePreview = async () => {
    if (!centreId) { toast.error("Select a centre"); return; }
    setLoading(true);
    const result = await previewCentreInvoice({ centreId, startDate, endDate });
    setPreview(result);
    setLoading(false);
    if (result.lineItems.length === 0) {
      toast.info("No completed sessions found for this period.");
    }
  };

  const handleGenerate = async () => {
    if (!centreId || !preview) return;
    setGenerating(true);
    const result = await createCentreInvoice({ centreId, startDate, endDate, createdBy: userId });
    setGenerating(false);
    if (result.success) {
      toast.success(`Invoice ${result.invoiceNumber} created`);
      const centreName = centres.find((c: { id: string; name: string }) => c.id === centreId)?.name || "Unknown";
      onCreated({
        id: result.invoiceId!,
        invoice_number: result.invoiceNumber!,
        centre_id: centreId,
        school_id: null,
        issue_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
        subtotal: preview.subtotal,
        gst: preview.gst,
        total: preview.total,
        status: "draft",
        payment_date: null,
        pdf_storage_path: null,
        notes: null,
        created_by: userId,
        created_at: new Date().toISOString(),
        line_items: [],
        entity_name: centreName,
      });
      setPreview(null);
    } else {
      toast.error(result.error || "Failed to create invoice");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Centre</label>
          <Select value={centreId} onValueChange={setCentreId}>
            <SelectTrigger><SelectValue placeholder="Select centre..." /></SelectTrigger>
            <SelectContent>
              {centres.map((c: { id: string; name: string }) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Start Date</label>
          <Input type="date" value={startDate} onChange={(e: ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">End Date</label>
          <Input type="date" value={endDate} onChange={(e: ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)} />
        </div>
      </div>

      <Button onClick={handlePreview} disabled={loading || !centreId} variant="outline">
        {loading ? "Loading..." : "Preview Invoice"}
      </Button>

      {preview && preview.lineItems.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Rate</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.lineItems.map((li: { date: string; description: string; unitPrice: number; lineTotal: number }, i: number) => (
                <tr key={i}>
                  <td className="px-3 py-2">{formatDate(li.date)}</td>
                  <td className="px-3 py-2">{li.description}</td>
                  <td className="px-3 py-2 text-right">{fmt(li.unitPrice)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(li.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">Subtotal</td>
                <td className="px-3 py-2 text-right font-medium">{fmt(preview.subtotal)}</td>
              </tr>
              {preview.gst > 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">GST (10%)</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(preview.gst)}</td>
                </tr>
              )}
              <tr className="bg-muted/30">
                <td colSpan={3} className="px-3 py-2 text-right font-bold">Total</td>
                <td className="px-3 py-2 text-right font-bold text-brand-orange">{fmt(preview.total)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="p-3 border-t">
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? "Generating..." : "Generate Invoice"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================
// School Invoice Form
// ========================

function SchoolInvoiceForm({
  schools,
  userId,
  onCreated,
}: {
  schools: Array<{ id: string; name: string }>;
  userId: string;
  onCreated: (inv: InvoiceWithItems) => void;
}) {
  const [schoolId, setSchoolId] = useState("");
  const year = new Date().getFullYear();
  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");
  const [preview, setPreview] = useState<SchoolInvoiceCalculation | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handlePreview = async () => {
    if (!schoolId || !termStart || !termEnd) { toast.error("Select a school and term dates"); return; }
    setLoading(true);
    const result = await previewSchoolInvoice({ schoolId, termStartDate: termStart, termEndDate: termEnd });
    setPreview(result);
    setLoading(false);
    if (result.lineItems.length === 0) {
      toast.info("No completed sessions found for this term.");
    }
  };

  const handleGenerate = async () => {
    if (!schoolId || !preview) return;
    setGenerating(true);
    const result = await createSchoolInvoice({ schoolId, termStartDate: termStart, termEndDate: termEnd, createdBy: userId });
    setGenerating(false);
    if (result.success) {
      toast.success(`Invoice ${result.invoiceNumber} created`);
      const schoolName = schools.find((s: { id: string; name: string }) => s.id === schoolId)?.name || "Unknown";
      onCreated({
        id: result.invoiceId!,
        invoice_number: result.invoiceNumber!,
        centre_id: null,
        school_id: schoolId,
        issue_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
        subtotal: preview.subtotal,
        gst: preview.gst,
        total: preview.total,
        status: "draft",
        payment_date: null,
        pdf_storage_path: null,
        notes: null,
        created_by: userId,
        created_at: new Date().toISOString(),
        line_items: [],
        entity_name: schoolName,
      });
      setPreview(null);
    } else {
      toast.error(result.error || "Failed to create invoice");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">School</label>
          <Select value={schoolId} onValueChange={setSchoolId}>
            <SelectTrigger><SelectValue placeholder="Select school..." /></SelectTrigger>
            <SelectContent>
              {schools.map((s: { id: string; name: string }) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Term Start</label>
          <Input type="date" value={termStart} onChange={(e: ChangeEvent<HTMLInputElement>) => setTermStart(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Term End</label>
          <Input type="date" value={termEnd} onChange={(e: ChangeEvent<HTMLInputElement>) => setTermEnd(e.target.value)} />
        </div>
      </div>

      <Button onClick={handlePreview} disabled={loading || !schoolId} variant="outline">
        {loading ? "Loading..." : "Preview Invoice"}
      </Button>

      {preview && preview.lineItems.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Children</th>
                <th className="px-3 py-2 text-right font-medium">Rate</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.lineItems.map((li: { date: string; description: string; childCount: number; unitPrice: number; lineTotal: number }, i: number) => (
                <tr key={i}>
                  <td className="px-3 py-2">{formatDate(li.date)}</td>
                  <td className="px-3 py-2">{li.description}</td>
                  <td className="px-3 py-2 text-right">{li.childCount}</td>
                  <td className="px-3 py-2 text-right">{fmt(li.unitPrice)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(li.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-muted-foreground">Subtotal</td>
                <td className="px-3 py-2 text-right font-medium">{fmt(preview.subtotal)}</td>
              </tr>
              {preview.gst > 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-muted-foreground">GST (10%)</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(preview.gst)}</td>
                </tr>
              )}
              <tr className="bg-muted/30">
                <td colSpan={4} className="px-3 py-2 text-right font-bold">Total</td>
                <td className="px-3 py-2 text-right font-bold text-brand-orange">{fmt(preview.total)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="p-3 border-t">
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? "Generating..." : "Generate Invoice"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================
// Invoice List
// ========================

function InvoiceList({
  invoices,
  onUpdate,
}: {
  invoices: InvoiceWithItems[];
  onUpdate: React.Dispatch<React.SetStateAction<InvoiceWithItems[]>>;
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = invoices.filter((inv: InvoiceWithItems) => {
    if (statusFilter !== "all" && inv.status !== statusFilter) return false;
    if (search && !inv.entity_name?.toLowerCase().includes(search.toLowerCase()) && !inv.invoice_number.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handlePdfAction = async (invoiceId: string, action: "preview" | "download") => {
    const { url, error } = await getInvoicePdfUrl(invoiceId);
    if (error || !url) {
      toast.error(error || "PDF not available");
      return;
    }
    if (action === "preview") {
      window.open(url, "_blank");
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = "invoice.pdf";
      a.click();
    }
  };

  const handleMarkSent = async (invoiceId: string) => {
    const result = await updateInvoiceStatus({ invoiceId, status: "sent" });
    if (result.success) {
      toast.success("Invoice marked as sent. Email sent to centre director.");
      onUpdate((prev: InvoiceWithItems[]) =>
        prev.map((i: InvoiceWithItems) => (i.id === invoiceId ? { ...i, status: "sent" } : i))
      );
    } else {
      toast.error(result.error || "Failed to update");
    }
  };

  const handleMarkPaid = async (invoiceId: string, paymentDate: string) => {
    const result = await updateInvoiceStatus({ invoiceId, status: "paid", paymentDate });
    if (result.success) {
      toast.success("Invoice marked as paid.");
      onUpdate((prev: InvoiceWithItems[]) =>
        prev.map((i: InvoiceWithItems) => (i.id === invoiceId ? { ...i, status: "paid", payment_date: paymentDate } : i))
      );
    } else {
      toast.error(result.error || "Failed to update");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            value={search}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Invoice #</th>
              <th className="px-3 py-2 text-left font-medium">Centre/School</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Issue Date</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Due Date</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-center font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No invoices found.
                </td>
              </tr>
            ) : (
              filtered.map((inv: InvoiceWithItems) => {
                const badge = STATUS_BADGE[inv.status] || STATUS_BADGE.draft;
                return (
                  <tr key={inv.id} className="hover:bg-muted/30">
                    <td className="px-3 py-3 font-mono text-sm whitespace-nowrap">{inv.invoice_number}</td>
                    <td className="px-3 py-3">{inv.entity_name || "—"}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDate(inv.issue_date)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDate(inv.due_date)}</td>
                    <td className="px-3 py-3 text-right font-medium whitespace-nowrap">{fmt(Number(inv.total))}</td>
                    <td className="px-3 py-3 text-center">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePdfAction(inv.id, "preview")}
                          title="Preview PDF"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePdfAction(inv.id, "download")}
                          title="Download PDF"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {inv.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkSent(inv.id)}
                            title="Mark as Sent"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        {(inv.status === "sent" || inv.status === "overdue") && (
                          <MarkPaidDialog
                            invoiceId={inv.id}
                            onPaid={handleMarkPaid}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ========================
// Mark Paid Dialog
// ========================

function MarkPaidDialog({
  invoiceId,
  onPaid,
}: {
  invoiceId: string;
  onPaid: (id: string, date: string) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Mark as Paid">
          <DollarSign className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Invoice as Paid</DialogTitle>
        </DialogHeader>
        <div>
          <label className="text-sm font-medium mb-1 block">Payment Date</label>
          <Input
            type="date"
            value={date}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              onPaid(invoiceId, date);
              setOpen(false);
            }}
          >
            Confirm Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
