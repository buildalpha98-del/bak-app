import { redirect } from "next/navigation";
import Link from "@/components/ui/app-link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAgeingReport } from "@/lib/outbound-invoicing/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadError } from "@/components/ui/load-error";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    sent: "bg-purple-100 text-purple-800",
    partially_paid: "bg-orange-100 text-orange-800",
    overdue: "bg-red-100 text-red-800",
  };
  const labels: Record<string, string> = {
    sent: "Sent",
    partially_paid: "Partially Paid",
    overdue: "Overdue",
  };
  return (
    <Badge className={styles[status] ?? "bg-secondary text-foreground"}>
      {labels[status] ?? status}
    </Badge>
  );
}

export default async function AgeingReportPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: brackets, error } = await getAgeingReport();

  if (error) {
    return (
      <LoadError message="Failed to load ageing report. Please try refreshing." />
    );
  }

  const totalOutstanding = (brackets ?? []).reduce(
    (sum, b) => sum + b.totalCents,
    0
  );

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Invoice Ageing Report
        </h1>
        <p className="text-sm text-muted-foreground">
          Outstanding invoices grouped by days overdue.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {(brackets ?? []).map((bracket) => (
          <Card key={bracket.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">{bracket.label}</p>
              <p className="text-lg font-semibold">
                {formatCurrency(bracket.totalCents)}
              </p>
              <p className="text-xs text-muted-foreground">
                {bracket.invoices.length} invoice
                {bracket.invoices.length !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4 pb-4 text-right">
          <p className="text-xs text-muted-foreground">Total Outstanding</p>
          <p className="text-xl font-bold text-red-700">
            {formatCurrency(totalOutstanding)}
          </p>
        </CardContent>
      </Card>

      {/* Detailed table grouped by bracket */}
      {(brackets ?? []).map((bracket) => {
        if (bracket.invoices.length === 0) return null;
        return (
          <div key={bracket.label} className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              {bracket.label}{" "}
              <span className="text-muted-foreground font-normal">
                — {formatCurrency(bracket.totalCents)}
              </span>
            </h2>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">
                      Invoice #
                    </th>
                    <th className="text-left px-4 py-3 font-medium">Centre</th>
                    <th className="text-right px-4 py-3 font-medium">
                      Amount
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      Days Outstanding
                    </th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">
                      Due Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bracket.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/invoicing/outbound/${inv.id}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {inv.invoiceNumber ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{inv.centreName}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(inv.amountOutstandingCents)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {inv.daysOutstanding}
                      </td>
                      <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(inv.dueDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
