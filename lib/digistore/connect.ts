// Interaktive Digistore24-API-Key-Erzeugung ("Connect with Digistore24").
//
// Ablauf (OAuth-artig, benötigt einen DEVELOPER-Key des SAAS-Betreibers):
//   1. requestApiKey(...) → { request_url, request_token }.
//      Den Merchant auf request_url leiten; request_token merken.
//   2. Merchant meldet sich bei Digistore an und autorisiert.
//   3. Digistore leitet zurück auf return_url.
//   4. retrieveApiKey(token) → { api_key, request_status: completed|pending|aborted }.
//
// Parameter gemäß echter DS24-API (requestApiKey/retrieveApiKey.expectedArgs).
import { ds24Post } from "./client";

export function developerKey(): string | null {
  return process.env.DIGISTORE_DEVELOPER_KEY || null;
}

/** Angeforderte Berechtigungen des zu erzeugenden Keys (an DS24-Format anpassen). */
export function requestedPermissions(): string {
  // Für createBuyUrl wird schreibender Zugriff benötigt. Der genaue
  // Permission-String hängt von der DS24-Konfiguration ab → per Env übersteuerbar.
  return process.env.DIGISTORE_REQUESTED_PERMISSIONS || "writable";
}

export interface RequestApiKeyResult {
  requestUrl: string;
  requestToken: string;
}

export async function requestApiKey(opts: {
  returnUrl: string;
  cancelUrl?: string;
  siteUrl?: string;
  comment?: string;
}): Promise<RequestApiKeyResult> {
  const devKey = developerKey();
  if (!devKey) throw new Error("DIGISTORE_DEVELOPER_KEY ist nicht gesetzt.");

  const params: Record<string, string> = {
    permissions: requestedPermissions(),
    return_url: opts.returnUrl,
  };
  if (opts.cancelUrl) params.cancel_url = opts.cancelUrl;
  if (opts.siteUrl) params.site_url = opts.siteUrl;
  if (opts.comment) params.comment = opts.comment;

  const data = (await ds24Post("requestApiKey", devKey, params)).data as {
    request_url?: string;
    request_token?: string;
  };
  if (!data?.request_url || !data?.request_token) {
    throw new Error("Digistore24 lieferte keine request_url/request_token.");
  }
  return { requestUrl: data.request_url, requestToken: data.request_token };
}

export type RequestStatus = "completed" | "pending" | "aborted";

export interface RetrieveApiKeyResult {
  status: RequestStatus;
  apiKey: string;
  name?: string;
  userId?: string;
  permissions?: string;
  /** DS24-Account-SHA-Passphrase (nur wenn die Berechtigung es erlaubt). */
  thankyouPageKey?: string;
}

export async function retrieveApiKey(token: string): Promise<RetrieveApiKeyResult> {
  const devKey = developerKey();
  if (!devKey) throw new Error("DIGISTORE_DEVELOPER_KEY ist nicht gesetzt.");

  const data = (await ds24Post("retrieveApiKey", devKey, { token })).data as {
    api_key?: string;
    name?: string;
    user_id?: string | number;
    permissions?: string;
    thankyou_page_key?: string;
    request_status?: RequestStatus;
  };
  return {
    status: (data?.request_status as RequestStatus) || "pending",
    apiKey: data?.api_key || "",
    name: data?.name,
    userId: data?.user_id !== undefined ? String(data.user_id) : undefined,
    permissions: data?.permissions,
    thankyouPageKey: data?.thankyou_page_key,
  };
}
