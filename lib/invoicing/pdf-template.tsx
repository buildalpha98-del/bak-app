import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { InvoiceLineItem } from "@/lib/types/database";

// ============================================================
// Props
// ============================================================

export interface InvoicePDFProps {
  invoiceNumber: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  coach: {
    name: string;
    address: string | null;
    abn: string | null;
    email: string;
    phone: string | null;
  };
  lineItems: InvoiceLineItem[];
  subtotal: number;
  gstAmount: number | null;
  total: number;
  gstRegistered: boolean;
  // Payroll extensions (migration 044)
  isPaymentSummary?: boolean;
  adjustments?: number;
  adjustmentReason?: string | null;
}

// ============================================================
// Styles
// ============================================================

const ORANGE = "#E8712A";
const DARK = "#1A1A1A";
const GREY = "#666666";
const LIGHT_GREY = "#F5F5F5";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 40,
    color: DARK,
  },
  accentBar: {
    height: 4,
    backgroundColor: ORANGE,
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: DARK,
  },
  invoiceInfo: {
    alignItems: "flex-end",
  },
  infoLabel: {
    fontSize: 8,
    color: GREY,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  parties: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 25,
  },
  partyBlock: {
    width: "45%",
  },
  partyLabel: {
    fontSize: 8,
    color: ORANGE,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  partyName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  partyDetail: {
    fontSize: 9,
    color: GREY,
    marginBottom: 2,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: LIGHT_GREY,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#E8E8E8",
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  colDate: { width: "14%" },
  colCentre: { width: "24%" },
  colSport: { width: "16%" },
  colDuration: { width: "12%", textAlign: "center" },
  colRate: { width: "16%", textAlign: "right" },
  colAmount: { width: "18%", textAlign: "right" },
  headerText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: GREY,
    textTransform: "uppercase",
  },
  cellText: {
    fontSize: 9,
  },
  totalsSection: {
    marginTop: 10,
    alignItems: "flex-end",
    paddingRight: 4,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 3,
    width: 200,
  },
  totalLabel: {
    fontSize: 9,
    color: GREY,
    width: 100,
    textAlign: "right",
    paddingRight: 10,
  },
  totalValue: {
    fontSize: 9,
    width: 100,
    textAlign: "right",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 6,
    width: 200,
    borderTopWidth: 1.5,
    borderTopColor: ORANGE,
    marginTop: 2,
  },
  grandTotalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    width: 100,
    textAlign: "right",
    paddingRight: 10,
  },
  grandTotalValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: ORANGE,
    width: 100,
    textAlign: "right",
  },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#E0E0E0",
    paddingTop: 10,
  },
  footerText: {
    fontSize: 8,
    color: GREY,
    textAlign: "center",
  },
});

// ============================================================
// Helpers
// ============================================================

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function fmtCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function fmtRate(rate: number, unit: string): string {
  if (unit === "per_hour") return `$${rate.toFixed(2)}/hr`;
  return `$${rate.toFixed(2)}/sess`;
}

function fmtDuration(mins: number): string {
  return `${mins} min`;
}

// ============================================================
// Component
// ============================================================

export function InvoicePDF({
  invoiceNumber,
  invoiceDate,
  periodStart,
  periodEnd,
  coach,
  lineItems,
  subtotal,
  gstAmount,
  total,
  gstRegistered,
  isPaymentSummary = false,
  adjustments = 0,
  adjustmentReason = null,
}: InvoicePDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Orange accent bar */}
        <View style={styles.accentBar} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{isPaymentSummary ? "PAYMENT SUMMARY" : "TAX INVOICE"}</Text>
          </View>
          <View style={styles.invoiceInfo}>
            <Text style={styles.infoLabel}>Invoice Number</Text>
            <Text style={styles.infoValue}>{invoiceNumber}</Text>
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>{invoiceDate}</Text>
            <Text style={styles.infoLabel}>Period</Text>
            <Text style={styles.infoValue}>
              {fmtDate(periodStart)} – {fmtDate(periodEnd)}
            </Text>
          </View>
        </View>

        {/* From / To */}
        <View style={styles.parties}>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>From</Text>
            <Text style={styles.partyName}>{coach.name}</Text>
            {coach.abn && (
              <Text style={styles.partyDetail}>ABN: {coach.abn}</Text>
            )}
            {coach.address && (
              <Text style={styles.partyDetail}>{coach.address}</Text>
            )}
            {coach.phone && (
              <Text style={styles.partyDetail}>{coach.phone}</Text>
            )}
            <Text style={styles.partyDetail}>{coach.email}</Text>
          </View>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>To</Text>
            <Text style={styles.partyName}>Build Alpha Kids</Text>
            <Text style={styles.partyDetail}>
              ABN: XX XXX XXX XXX
            </Text>
            <Text style={styles.partyDetail}>
              Bankstown, NSW 2200
            </Text>
            <Text style={styles.partyDetail}>
              contact@buildalphakids.com.au
            </Text>
          </View>
        </View>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <View style={styles.colDate}>
            <Text style={styles.headerText}>Date</Text>
          </View>
          <View style={styles.colCentre}>
            <Text style={styles.headerText}>Centre</Text>
          </View>
          <View style={styles.colSport}>
            <Text style={styles.headerText}>Sport</Text>
          </View>
          <View style={styles.colDuration}>
            <Text style={styles.headerText}>Duration</Text>
          </View>
          <View style={styles.colRate}>
            <Text style={styles.headerText}>Rate</Text>
          </View>
          <View style={styles.colAmount}>
            <Text style={styles.headerText}>Amount</Text>
          </View>
        </View>

        {/* Table Rows */}
        {lineItems.map((item, i) => (
          <View key={i} style={styles.tableRow}>
            <View style={styles.colDate}>
              <Text style={styles.cellText}>{fmtDate(item.date)}</Text>
            </View>
            <View style={styles.colCentre}>
              <Text style={styles.cellText}>{item.centre_name}</Text>
            </View>
            <View style={styles.colSport}>
              <Text style={styles.cellText}>{item.sport}</Text>
            </View>
            <View style={styles.colDuration}>
              <Text style={styles.cellText}>
                {fmtDuration(item.duration_minutes)}
              </Text>
            </View>
            <View style={styles.colRate}>
              <Text style={styles.cellText}>
                {fmtRate(item.rate, item.rate_unit)}
              </Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.cellText}>
                {fmtCurrency(item.amount)}
              </Text>
            </View>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmtCurrency(subtotal)}</Text>
          </View>
          {adjustments !== 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {adjustments > 0 ? "Bonus" : "Deduction"}
                {adjustmentReason ? ` (${adjustmentReason})` : ""}
              </Text>
              <Text style={styles.totalValue}>{fmtCurrency(adjustments)}</Text>
            </View>
          )}
          {gstRegistered && gstAmount != null && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>GST (10%)</Text>
              <Text style={styles.totalValue}>{fmtCurrency(gstAmount)}</Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{fmtCurrency(total)}</Text>
          </View>
        </View>

        {/* Payment summary disclaimer */}
        {isPaymentSummary && (
          <View style={{ marginTop: 20, padding: 10, backgroundColor: LIGHT_GREY }}>
            <Text style={{ fontSize: 8, color: GREY, textAlign: "center" }}>
              This is a payment summary, not a tax invoice. Coaches are responsible for issuing their own tax invoices and managing their own GST/tax obligations.
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {isPaymentSummary ? "Payment Summary" : "Payment Terms: Payment within 14 days"}
          </Text>
          <Text style={styles.footerText}>
            Build Alpha Kids · Multi-sport coaching · South-West Sydney
          </Text>
        </View>
      </Page>
    </Document>
  );
}
