// lib/quickbooks/intuit-oauth.d.ts
declare module "intuit-oauth" {
  interface OAuthClientOptions {
    clientId: string;
    clientSecret: string;
    environment: "sandbox" | "production";
    redirectUri: string;
  }

  interface AuthorizeUriOptions {
    scope: string[];
    state: string;
  }

  interface TokenResponse {
    getJson(): {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };
  }

  class OAuthClient {
    static scopes: { Accounting: string };
    constructor(options: OAuthClientOptions);
    authorizeUri(options: AuthorizeUriOptions): string;
    createToken(url: string): Promise<TokenResponse>;
    refresh(): Promise<TokenResponse>;
    setToken(token: {
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
    }): void;
  }

  export default OAuthClient;
}
