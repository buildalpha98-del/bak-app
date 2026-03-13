import "server-only";

import OAuthClient from "intuit-oauth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "./crypto";

const QB_BASE_URL =
  process.env.QB_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

export interface QBClient {
  accessToken: string;
  realmId: string;
  baseUrl: string;
}

function createOAuthClient(): OAuthClient {
  return new OAuthClient({
    clientId: process.env.QB_CLIENT_ID!,
    clientSecret: process.env.QB_CLIENT_SECRET!,
    environment:
      process.env.QB_ENVIRONMENT === "production" ? "production" : "sandbox",
    redirectUri: process.env.QB_REDIRECT_URI!,
  });
}

/**
 * Get the authorisation URL to redirect the user to QuickBooks for OAuth consent.
 */
export function getAuthorizationUrl(state: string): string {
  const oauthClient = createOAuthClient();
  return oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });
}

/**
 * Exchange an authorisation code for tokens and persist them.
 */
export async function exchangeCodeForTokens(
  url: string,
  userId: string
): Promise<{ realmId: string; companyName: string }> {
  const oauthClient = createOAuthClient();
  const authResponse = await oauthClient.createToken(url);
  const token = authResponse.getJson();

  const realmId = new URL(url, "http://localhost").searchParams.get("realmId");
  if (!realmId) throw new Error("No realmId in callback URL.");

  // Fetch company name
  const companyInfoUrl = `${QB_BASE_URL}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`;
  const companyResponse = await fetch(companyInfoUrl, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const companyData = await companyResponse.json();
  const companyName =
    companyData?.CompanyInfo?.CompanyName ?? "Unknown Company";

  // Encrypt and store tokens
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("integration_tokens").upsert(
    {
      provider: "quickbooks",
      access_token_encrypted: encrypt(token.access_token),
      refresh_token_encrypted: encrypt(token.refresh_token),
      realm_id: realmId,
      token_expiry: new Date(
        Date.now() + token.expires_in * 1000
      ).toISOString(),
      company_name: companyName,
      connected_by: userId,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "provider" }
  );

  if (error) throw new Error(`Failed to store tokens: ${error.message}`);

  return { realmId, companyName };
}

/**
 * Get an authenticated QB client, auto-refreshing the token if needed.
 * Throws if not connected or refresh fails.
 */
export async function getQuickBooksClient(): Promise<QBClient> {
  const admin = createSupabaseAdmin();
  const { data: row, error } = await admin
    .from("integration_tokens")
    .select("*")
    .eq("provider", "quickbooks")
    .single();

  if (error || !row) {
    throw new Error("QuickBooks is not connected.");
  }

  const tokenExpiry = new Date(row.token_expiry);
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

  let accessToken: string;

  if (tokenExpiry <= fiveMinutesFromNow) {
    // Token expired or expiring soon — refresh
    const oauthClient = createOAuthClient();
    oauthClient.setToken({
      access_token: decrypt(row.access_token_encrypted),
      refresh_token: decrypt(row.refresh_token_encrypted),
      token_type: "bearer",
      expires_in: 0,
    });

    const refreshResponse = await oauthClient.refresh();
    const newToken = refreshResponse.getJson();

    accessToken = newToken.access_token;

    // Update stored tokens
    const { error: updateError } = await admin
      .from("integration_tokens")
      .update({
        access_token_encrypted: encrypt(newToken.access_token),
        refresh_token_encrypted: encrypt(newToken.refresh_token),
        token_expiry: new Date(
          Date.now() + newToken.expires_in * 1000
        ).toISOString(),
      })
      .eq("provider", "quickbooks");

    if (updateError) {
      console.error("Failed to update refreshed tokens:", updateError);
    }
  } else {
    accessToken = decrypt(row.access_token_encrypted);
  }

  return {
    accessToken,
    realmId: row.realm_id!,
    baseUrl: QB_BASE_URL,
  };
}

/**
 * Check if QuickBooks is currently connected.
 */
export async function isQuickBooksConnected(): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("integration_tokens")
    .select("id")
    .eq("provider", "quickbooks")
    .single();
  return !!data;
}
