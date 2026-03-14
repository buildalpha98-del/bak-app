import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePDF } from "@/lib/invoicing/pdf-template";
import { formatInvoiceDate } from "@/lib/utils/invoicing";
import type { InvoiceLineItem } from "@/lib/types/database";
import React from "react";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json();
    const { invoiceId } = body as { invoiceId: string };

    if (!invoiceId) {
      return NextResponse.json(
        { error: "invoiceId is required." },
        { status: 400 }
      );
    }

    // Fetch invoice
    const { data: invoice, error: invErr } = await supabase
      .from("coach_invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found." },
        { status: 404 }
      );
    }

    // Fetch coach profile
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("name, email, phone, address, abn, gst_registered")
      .eq("id", invoice.coach_id)
      .single();

    if (profErr || !profile) {
      return NextResponse.json(
        { error: "Coach profile not found." },
        { status: 404 }
      );
    }

    const lineItems = (invoice.line_items_json ?? []) as InvoiceLineItem[];
    const subtotal =
      Math.round(lineItems.reduce((sum, item) => sum + item.amount, 0) * 100) /
      100;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = React.createElement(InvoicePDF, {
      invoiceNumber: invoice.invoice_number ?? invoice.id.slice(0, 8),
      invoiceDate: formatInvoiceDate(
        invoice.created_at?.split("T")[0] ?? new Date().toISOString().split("T")[0]
      ),
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
      coach: {
        name: profile.name,
        address: profile.address,
        abn: profile.abn,
        email: profile.email,
        phone: profile.phone,
      },
      lineItems,
      subtotal,
      gstAmount: invoice.gst_amount,
      total: invoice.total_amount,
      gstRegistered: profile.gst_registered,
    });
    // react-pdf renderToBuffer expects a Document element; InvoicePDF wraps its content in <Document>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(pdfElement as any);

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoice_number ?? "invoice"}.pdf"`,
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF." },
      { status: 500 }
    );
  }
}
