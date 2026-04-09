import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

// ============================================================
// Props
// ============================================================

export interface LaunchInvoicePDFProps {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  isGstRegistered: boolean;
  from: {
    businessName: string;
    abn: string;
  };
  to: {
    name: string;
    address: string | null;
  };
  lineItems: {
    date: string;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  gst: number;
  total: number;
  bankDetails: {
    bankName: string;
    bsb: string;
    accountNumber: string;
  } | null;
  notes: string | null;
}

// ============================================================
// Styles
// ============================================================

const ORANGE = "#E8712A";
const DARK = "#1A1A1A";
const GREY = "#666666";
const LIGHT_GREY = "#F5F5F5";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, padding: 40, color: DARK },
  accentBar: { height: 4, backgroundColor: ORANGE, marginBottom: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 30,
  },
  brandName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: DARK },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", color: DARK },
  detailsRow: { flexDirection: "row", marginBottom: 4 },
  detailLabel: { fontSize: 8, color: GREY, width: 100 },
  detailValue: { fontSize: 9, fontFamily: "Helvetica-Bold", flex: 1 },
  parties: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 25,
  },
  partyBlock: { width: "45%" },
  partyLabel: {
    fontSize: 8,
    color: ORANGE,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  partyName: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  partyDetail: { fontSize: 9, color: GREY, marginBottom: 2 },
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
  colDesc: { width: "40%" },
  colQty: { width: "12%", textAlign: "center" as const },
  colPrice: { width: "16%", textAlign: "right" as const },
  colTotal: { width: "18%", textAlign: "right" as const },
  headerText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: GREY,
    textTransform: "uppercase",
  },
  cellText: { fontSize: 9 },
  totalsSection: { marginTop: 10, alignItems: "flex-end", paddingRight: 4 },
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
    textAlign: "right" as const,
    paddingRight: 10,
  },
  totalValue: { fontSize: 9, width: 100, textAlign: "right" as const },
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
    textAlign: "right" as const,
    paddingRight: 10,
  },
  grandTotalValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: ORANGE,
    width: 100,
    textAlign: "right" as const,
  },
  paymentSection: {
    marginTop: 25,
    padding: 14,
    backgroundColor: LIGHT_GREY,
    borderRadius: 4,
  },
  paymentTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  paymentRow: { flexDirection: "row", marginBottom: 3 },
  paymentLabel: { fontSize: 9, color: GREY, width: 120 },
  paymentValue: { fontSize: 9, fontFamily: "Helvetica-Bold", flex: 1 },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#E0E0E0",
    paddingTop: 8,
  },
  footerText: { fontSize: 8, color: GREY, textAlign: "center" as const },
});

// ============================================================
// Helpers
// ============================================================

function fmt(n: number): string {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

// ============================================================
// Component
// ============================================================

export function LaunchInvoicePDF(props: LaunchInvoicePDFProps) {
  const {
    invoiceNumber,
    issueDate,
    dueDate,
    isGstRegistered,
    from,
    to,
    lineItems,
    subtotal,
    gst,
    total,
    bankDetails,
    notes,
  } = props;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Orange accent bar */}
        <View style={s.accentBar} />

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brandName}>Build Alpha Kids</Text>
            <Text style={s.partyDetail}>{from.businessName}</Text>
            {from.abn && <Text style={s.partyDetail}>ABN: {from.abn}</Text>}
          </View>
          <View>
            <Text style={s.title}>
              {isGstRegistered ? "TAX INVOICE" : "INVOICE"}
            </Text>
          </View>
        </View>

        {/* Invoice details */}
        <View style={{ alignItems: "flex-end", marginBottom: 25 }}>
          <View style={{ width: 220 }}>
            <View style={s.detailsRow}>
              <Text style={s.detailLabel}>Invoice Number</Text>
              <Text style={s.detailValue}>{invoiceNumber}</Text>
            </View>
            <View style={s.detailsRow}>
              <Text style={s.detailLabel}>Issue Date</Text>
              <Text style={s.detailValue}>{formatDate(issueDate)}</Text>
            </View>
            <View style={s.detailsRow}>
              <Text style={s.detailLabel}>Due Date</Text>
              <Text style={s.detailValue}>{formatDate(dueDate)}</Text>
            </View>
          </View>
        </View>

        {/* To */}
        <View style={s.parties}>
          <View style={s.partyBlock}>
            <Text style={s.partyLabel}>Bill To</Text>
            <Text style={s.partyName}>{to.name}</Text>
            {to.address && <Text style={s.partyDetail}>{to.address}</Text>}
          </View>
        </View>

        {/* Line items table */}
        <View style={s.tableHeader}>
          <Text style={[s.headerText, s.colDate]}>Date</Text>
          <Text style={[s.headerText, s.colDesc]}>Description</Text>
          <Text style={[s.headerText, s.colQty]}>Qty</Text>
          <Text style={[s.headerText, s.colPrice]}>Unit Price</Text>
          <Text style={[s.headerText, s.colTotal]}>Total</Text>
        </View>
        {lineItems.map((item, i) => (
          <View key={i} style={s.tableRow}>
            <Text style={[s.cellText, s.colDate]}>{formatDate(item.date)}</Text>
            <Text style={[s.cellText, s.colDesc]}>{item.description}</Text>
            <Text style={[s.cellText, s.colQty]}>{item.quantity}</Text>
            <Text style={[s.cellText, s.colPrice]}>{fmt(item.unitPrice)}</Text>
            <Text style={[s.cellText, s.colTotal]}>{fmt(item.lineTotal)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={s.totalsSection}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{fmt(subtotal)}</Text>
          </View>
          {isGstRegistered && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>GST (10%)</Text>
              <Text style={s.totalValue}>{fmt(gst)}</Text>
            </View>
          )}
          <View style={s.grandTotalRow}>
            <Text style={s.grandTotalLabel}>TOTAL</Text>
            <Text style={s.grandTotalValue}>{fmt(total)}</Text>
          </View>
        </View>

        {/* Payment details */}
        {bankDetails && (
          <View style={s.paymentSection}>
            <Text style={s.paymentTitle}>Payment Details</Text>
            <View style={s.paymentRow}>
              <Text style={s.paymentLabel}>Bank</Text>
              <Text style={s.paymentValue}>{bankDetails.bankName}</Text>
            </View>
            <View style={s.paymentRow}>
              <Text style={s.paymentLabel}>BSB</Text>
              <Text style={s.paymentValue}>{bankDetails.bsb}</Text>
            </View>
            <View style={s.paymentRow}>
              <Text style={s.paymentLabel}>Account Number</Text>
              <Text style={s.paymentValue}>{bankDetails.accountNumber}</Text>
            </View>
            <View style={s.paymentRow}>
              <Text style={s.paymentLabel}>Reference</Text>
              <Text style={s.paymentValue}>{invoiceNumber}</Text>
            </View>
          </View>
        )}

        {/* Notes */}
        {notes && (
          <View style={{ marginTop: 15 }}>
            <Text style={{ fontSize: 8, color: GREY, fontStyle: "italic" }}>
              {notes}
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            Payment due within 14 days. Please use invoice number as payment reference.
          </Text>
          <Text style={[s.footerText, { marginTop: 2 }]}>
            Build Alpha Kids &bull; Multi-Sport Coaching &bull; info@buildalphakids.com.au
          </Text>
        </View>
      </Page>
    </Document>
  );
}
