import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { invoiceReminderEmail } from "@/lib/email/templates";
import { triggerNotificationForOps } from "@/lib/notifications/send";
import { autoCreateTask } from "@/lib/tasks/auto-create";

// ============================================================
// Invoice Reminders Cron — runs daily at 7am AEST
// 1. Due-today reminders
// 2. 7-day overdue → mark overdue + email + Kanban task
// 3. 14-day and 30-day escalation emails
// ============================================================

interface BankDetails {
  bankName: string;
  bsb: string;
  accountNumber: string;
  accountName: string;
}

function parseBankDetails(settings: Record<string, unknown>): BankDetails | null {
  const bankName = settings.bank_name as string | undefined;
  const bsb = settings.bank_bsb as string | undefined;
  const accountNumber = settings.bank_account_number as string | undefined;
  const accountName = settings.bank_account_name as string | undefined;

  if (!bankName || !bsb || !accountNumber || !accountName) return null;

  return { bankName, bsb, accountNumber, accountName };
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function daysBetween(dateStr: string, now: Date): number {
  const date = new Date(dateStr);
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

  // Load business settings for bank details and payment URL
  const { data: settingsRows } = await admin.from("business_settings").select("key, value");
  const settings: Record<string, unknown> = {};
  for (const row of settingsRows ?? []) {
    settings[row.key] = row.value;
  }

  const bankDetails = parseBankDetails(settings);
  const payOnlineUrl = (settings.pay_online_url as string) ?? null;

  let processed = 0;

  // ────────────────────────────────────────────
  // 1. Due-today reminders
  // ────────────────────────────────────────────
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const { data: dueToday } = await admin
    .from("outbound_invoices")
    .select("id, invoice_number, total_amount, due_date, reminder_sent_at, centre_id")
    .eq("status", "sent")
    .eq("due_date", todayStr);

  for (const inv of dueToday ?? []) {
    // Skip if reminder was sent within last 3 days
    if (inv.reminder_sent_at && new Date(inv.reminder_sent_at) > threeDaysAgo) {
      continue;
    }

    // Get centre primary contact
    const contact = await getCentreContact(admin, inv.centre_id);
    if (!contact) continue;

    const email = invoiceReminderEmail(
      contact.name,
      inv.invoice_number,
      formatCurrency(inv.total_amount),
      formatDate(inv.due_date),
      0,
      bankDetails,
      payOnlineUrl
    );

    await sendEmail(contact.email, email.subject, email.html);

    await admin
      .from("outbound_invoices")
      .update({ reminder_sent_at: now.toISOString() })
      .eq("id", inv.id);

    processed++;
  }

  // ────────────────────────────────────────────
  // 2. 7 days overdue → mark overdue + task
  // ────────────────────────────────────────────
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const { data: newlyOverdue } = await admin
    .from("outbound_invoices")
    .select("id, invoice_number, total_amount, due_date, centre_id")
    .eq("status", "sent")
    .lte("due_date", sevenDaysAgoStr);

  for (const inv of newlyOverdue ?? []) {
    const daysOverdue = daysBetween(inv.due_date, now);

    // Mark as overdue
    await admin
      .from("outbound_invoices")
      .update({ status: "overdue", reminder_sent_at: now.toISOString() })
      .eq("id", inv.id);

    // Get centre info for task title
    const { data: centre } = await admin
      .from("centres")
      .select("name")
      .eq("id", inv.centre_id)
      .single();

    const centreName = centre?.name ?? "Unknown Centre";

    // Send overdue email
    const contact = await getCentreContact(admin, inv.centre_id);
    if (contact) {
      const email = invoiceReminderEmail(
        contact.name,
        inv.invoice_number,
        formatCurrency(inv.total_amount),
        formatDate(inv.due_date),
        daysOverdue,
        bankDetails,
        payOnlineUrl
      );

      await sendEmail(contact.email, email.subject, email.html);
    }

    // Auto-create Kanban task
    await autoCreateTask({
      title: `Overdue invoice: ${centreName} — ${inv.invoice_number}`,
      description: `Invoice ${inv.invoice_number} for ${formatCurrency(inv.total_amount)} is ${daysOverdue} days overdue (due ${formatDate(inv.due_date)}).`,
      priority: "high",
      linkedEntityType: "outbound_invoice",
      linkedEntityId: inv.id,
      source: "invoice_overdue",
    });

    processed++;
  }

  // ────────────────────────────────────────────
  // 3. 14-day and 30-day escalation
  // ────────────────────────────────────────────
  const { data: overdueInvoices } = await admin
    .from("outbound_invoices")
    .select("id, invoice_number, total_amount, due_date, reminder_sent_at, centre_id")
    .eq("status", "overdue");

  for (const inv of overdueInvoices ?? []) {
    const daysOverdue = daysBetween(inv.due_date, now);

    // Only process at 14-day and 30-day marks
    // Allow a 1-day window to account for timing
    const is14Day = daysOverdue >= 14 && daysOverdue < 16;
    const is30Day = daysOverdue >= 30 && daysOverdue < 32;

    if (!is14Day && !is30Day) continue;

    // Skip if reminder was sent within last 3 days (avoid duplicates)
    if (inv.reminder_sent_at) {
      const lastReminder = new Date(inv.reminder_sent_at);
      if (now.getTime() - lastReminder.getTime() < 3 * 24 * 60 * 60 * 1000) {
        continue;
      }
    }

    const contact = await getCentreContact(admin, inv.centre_id);
    if (contact) {
      const email = invoiceReminderEmail(
        contact.name,
        inv.invoice_number,
        formatCurrency(inv.total_amount),
        formatDate(inv.due_date),
        daysOverdue,
        bankDetails,
        payOnlineUrl
      );

      await sendEmail(contact.email, email.subject, email.html);
    }

    await admin
      .from("outbound_invoices")
      .update({ reminder_sent_at: now.toISOString() })
      .eq("id", inv.id);

    // At 30 days, notify admin/ops
    if (is30Day) {
      const { data: centre } = await admin
        .from("centres")
        .select("name")
        .eq("id", inv.centre_id)
        .single();

      const centreName = centre?.name ?? "Unknown Centre";

      await triggerNotificationForOps({
        type: "invoice_overdue",
        title: "Invoice 30 days overdue",
        body: `${inv.invoice_number} for ${centreName} (${formatCurrency(inv.total_amount)}) is 30+ days overdue.`,
        entityType: "outbound_invoice",
        entityId: inv.id,
      });
    }

    processed++;
  }

  return NextResponse.json({ success: true, processed });
}

// ============================================================
// Helper: get centre primary contact email
// ============================================================

async function getCentreContact(
  admin: ReturnType<typeof createSupabaseAdmin>,
  centreId: string
): Promise<{ name: string; email: string } | null> {
  // Try client_users first (primary contact) — then the join table,
  // for a multi-campus primary defaulted at another centre.
  const { data: clientUsers } = await admin
    .from("client_users")
    .select("name, email")
    .eq("centre_id", centreId)
    .eq("is_primary", true)
    .limit(1);
  const clientUser = clientUsers?.[0] ?? null;

  if (clientUser?.email) {
    return { name: clientUser.name ?? "Team", email: clientUser.email };
  }

  const { data: joined } = await admin
    .from("client_user_centres")
    .select("client_users!inner(name, email, is_primary)")
    .eq("centre_id", centreId);
  const joinedPrimary = (joined ?? [])
    .map((j) => j.client_users as unknown as { name: string | null; email: string; is_primary: boolean })
    .find((cu) => cu?.is_primary && cu.email);
  if (joinedPrimary) {
    return { name: joinedPrimary.name ?? "Team", email: joinedPrimary.email };
  }

  // Fallback to centre contact_email
  const { data: centre } = await admin
    .from("centres")
    .select("contact_email, contact_name, name")
    .eq("id", centreId)
    .single();

  if (centre?.contact_email) {
    return {
      name: centre.contact_name ?? centre.name ?? "Team",
      email: centre.contact_email,
    };
  }

  return null;
}
