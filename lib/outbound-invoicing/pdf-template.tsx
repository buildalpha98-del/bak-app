import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Link,
  StyleSheet,
} from "@react-pdf/renderer";

// ============================================================
// Props
// ============================================================

export interface OutboundInvoicePDFProps {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  paymentTermsText: string;
  from: {
    businessName: string;
    abn: string;
    address: string;
    phone: string;
    email: string;
  };
  to: {
    centreName: string;
    contactName: string | null;
    address: string | null;
  };
  lineItems: {
    date: string;
    description: string;
    sport: string;
    quantity: number | null;
    rate: number;
    amount: number;
  }[];
  subtotal: number;
  gstAmount: number | null;
  total: number;
  bankDetails: {
    bankName: string;
    bsb: string;
    accountNumber: string;
    accountName: string;
  } | null;
  payOnlineUrl: string | null;
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
    alignItems: "flex-start",
    marginBottom: 30,
  },
  brandName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: DARK,
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: DARK,
  },
  invoiceDetails: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 25,
  },
  detailsBlock: {
    width: 220,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 8,
    color: GREY,
    width: 100,
  },
  detailValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    flex: 1,
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
  colDate: { width: "12%" },
  colDescription: { width: "30%" },
  colSport: { width: "14%" },
  colQty: { width: "10%", textAlign: "center" },
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
  paymentSection: {
    marginTop: 25,
    padding: 14,
    backgroundColor: LIGHT_GREY,
    borderRadius: 4,
  },
  paymentTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: DARK,
    marginBottom: 8,
  },
  paymentRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  paymentLabel: {
    fontSize: 9,
    color: GREY,
    width: 110,
  },
  paymentValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  payOnlineRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  payOnlineLabel: {
    fontSize: 9,
    color: GREY,
    marginRight: 6,
  },
  payOnlineLink: {
    fontSize: 9,
    color: ORANGE,
    textDecoration: "underline",
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
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function fmtCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// ============================================================
// Component
// ============================================================

export function OutboundInvoicePDF({
  invoiceNumber,
  invoiceDate,
  dueDate,
  periodStart,
  periodEnd,
  paymentTermsText,
  from,
  to,
  lineItems,
  subtotal,
  gstAmount,
  total,
  bankDetails,
  payOnlineUrl,
}: OutboundInvoicePDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Orange accent bar */}
        <View style={styles.accentBar} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandName}>Build Alpha Kids</Text>
          </View>
          <View>
            <Text style={styles.title}>TAX INVOICE</Text>
          </View>
        </View>

        {/* Invoice details */}
        <View style={styles.invoiceDetails}>
          <View style={styles.detailsBlock}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Invoice Number</Text>
              <Text style={styles.detailValue}>{invoiceNumber}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Invoice Date</Text>
              <Text style={styles.detailValue}>{fmtDate(invoiceDate)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Due Date</Text>
              <Text style={styles.detailValue}>{fmtDate(dueDate)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Period</Text>
              <Text style={styles.detailValue}>
                {fmtShortDate(periodStart)} – {fmtShortDate(periodEnd)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payment Terms</Text>
              <Text style={styles.detailValue}>{paymentTermsText}</Text>
            </View>
          </View>
        </View>

        {/* From / To */}
        <View style={styles.parties}>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>From</Text>
            <Text style={styles.partyName}>{from.businessName}</Text>
            <Text style={styles.partyDetail}>ABN: {from.abn}</Text>
            <Text style={styles.partyDetail}>{from.address}</Text>
            <Text style={styles.partyDetail}>{from.phone}</Text>
            <Text style={styles.partyDetail}>{from.email}</Text>
          </View>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>To</Text>
            <Text style={styles.partyName}>{to.centreName}</Text>
            {to.contactName && (
              <Text style={styles.partyDetail}>{to.contactName}</Text>
            )}
            {to.address && (
              <Text style={styles.partyDetail}>{to.address}</Text>
            )}
          </View>
        </View>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <View style={styles.colDate}>
            <Text style={styles.headerText}>Date</Text>
          </View>
          <View style={styles.colDescription}>
            <Text style={styles.headerText}>Description</Text>
          </View>
          <View style={styles.colSport}>
            <Text style={styles.headerText}>Sport</Text>
          </View>
          <View style={styles.colQty}>
            <Text style={styles.headerText}>Qty</Text>
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
              <Text style={styles.cellText}>{fmtShortDate(item.date)}</Text>
            </View>
            <View style={styles.colDescription}>
              <Text style={styles.cellText}>{item.description}</Text>
            </View>
            <View style={styles.colSport}>
              <Text style={styles.cellText}>{item.sport}</Text>
            </View>
            <View style={styles.colQty}>
              <Text style={styles.cellText}>
                {item.quantity != null ? item.quantity : "—"}
              </Text>
            </View>
            <View style={styles.colRate}>
              <Text style={styles.cellText}>{fmtCurrency(item.rate)}</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.cellText}>{fmtCurrency(item.amount)}</Text>
            </View>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmtCurrency(subtotal)}</Text>
          </View>
          {gstAmount != null && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>GST (10%)</Text>
              <Text style={styles.totalValue}>{fmtCurrency(gstAmount)}</Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total Due</Text>
            <Text style={styles.grandTotalValue}>{fmtCurrency(total)}</Text>
          </View>
        </View>

        {/* Payment Details */}
        {bankDetails && (
          <View style={styles.paymentSection}>
            <Text style={styles.paymentTitle}>Payment Details</Text>
            <Text style={styles.partyDetail}>
              Please pay via bank transfer to:
            </Text>
            <View style={{ marginTop: 6 }}>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Bank</Text>
                <Text style={styles.paymentValue}>{bankDetails.bankName}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>BSB</Text>
                <Text style={styles.paymentValue}>{bankDetails.bsb}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Account Number</Text>
                <Text style={styles.paymentValue}>
                  {bankDetails.accountNumber}
                </Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Account Name</Text>
                <Text style={styles.paymentValue}>
                  {bankDetails.accountName}
                </Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Reference</Text>
                <Text style={styles.paymentValue}>{invoiceNumber}</Text>
              </View>
            </View>
            {payOnlineUrl && (
              <View style={styles.payOnlineRow}>
                <Text style={styles.payOnlineLabel}>Or pay online:</Text>
                <Link src={payOnlineUrl} style={styles.payOnlineLink}>
                  {payOnlineUrl}
                </Link>
              </View>
            )}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Thank you for choosing Build Alpha Kids
          </Text>
          <Text style={styles.footerText}>
            {from.phone} · {from.email}
          </Text>
          <Text style={styles.footerText}>
            Build Alpha Kids · Multi-Sport Coaching · South-West Sydney
          </Text>
        </View>
      </Page>
    </Document>
  );
}
