import "server-only";

import type { QBClient } from "./client";
import type { OutboundLineItem } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

interface QBCustomerPayload {
  DisplayName: string;
  CompanyName: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: { Line1: string };
}

interface QBInvoicePayload {
  CustomerRef: { value: string };
  Line: QBInvoiceLine[];
  DueDate: string;
  DocNumber: string;
}

interface QBInvoiceLine {
  DetailType: "SalesItemLineDetail";
  Amount: number;
  Description: string;
  SalesItemLineDetail: {
    ItemRef: { value: string };
    Qty: number;
    UnitPrice: number;
  };
}

// ============================================================
// Helpers
// ============================================================

const MINOR_VERSION = "65";

async function qbFetch(
  client: QBClient,
  path: string,
  options?: RequestInit,
  retries = 3
): Promise<Response> {
  const url = `${client.baseUrl}/v3/company/${client.realmId}${path}?minorversion=${MINOR_VERSION}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${client.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    // Retry on rate limit (429) with exponential backoff
    if (response.status === 429 && attempt < retries) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `QuickBooks API error (${response.status}): ${body}`
      );
    }

    return response;
  }

  throw new Error("QuickBooks API: max retries exceeded.");
}

// ============================================================
// Customer Operations
// ============================================================

export async function createCustomer(
  client: QBClient,
  payload: QBCustomerPayload
): Promise<string> {
  const response = await qbFetch(client, "/customer", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  return data.Customer.Id as string;
}

export async function updateCustomer(
  client: QBClient,
  customerId: string,
  payload: Partial<QBCustomerPayload>
): Promise<void> {
  // Fetch current SyncToken first (required for QB updates)
  const getResponse = await qbFetch(client, `/customer/${customerId}`);
  const currentData = await getResponse.json();
  const syncToken = currentData.Customer.SyncToken;

  await qbFetch(client, "/customer", {
    method: "POST",
    body: JSON.stringify({
      Id: customerId,
      SyncToken: syncToken,
      sparse: true,
      ...payload,
    }),
  });
}

// ============================================================
// Invoice Operations
// ============================================================

export function buildInvoicePayload(
  qbCustomerId: string,
  invoiceNumber: string,
  lineItems: OutboundLineItem[],
  dueDate: string
): QBInvoicePayload {
  const itemId = process.env.QB_DEFAULT_ITEM_ID;
  if (!itemId) {
    throw new Error("QB_DEFAULT_ITEM_ID environment variable is not set.");
  }

  return {
    CustomerRef: { value: qbCustomerId },
    DocNumber: invoiceNumber,
    DueDate: dueDate,
    Line: lineItems.map((item) => ({
      DetailType: "SalesItemLineDetail" as const,
      Amount: item.amount,
      Description: item.description,
      SalesItemLineDetail: {
        ItemRef: { value: itemId },
        Qty: 1,
        UnitPrice: item.amount,
      },
    })),
  };
}

export async function createInvoice(
  client: QBClient,
  payload: QBInvoicePayload
): Promise<string> {
  const response = await qbFetch(client, "/invoice", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  return data.Invoice.Id as string;
}

export async function getInvoice(
  client: QBClient,
  invoiceId: string
): Promise<{ Id: string; Balance: number; TotalAmt: number }> {
  const response = await qbFetch(client, `/invoice/${invoiceId}`);
  const data = await response.json();
  return {
    Id: data.Invoice.Id,
    Balance: data.Invoice.Balance,
    TotalAmt: data.Invoice.TotalAmt,
  };
}
