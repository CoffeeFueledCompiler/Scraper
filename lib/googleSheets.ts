// Writes rows to a specific Google Sheet — no googleapis dependency, just
// node:crypto + fetch, since that's the whole surface area we need for one
// auth exchange and two API calls.
//
// Supports two credential shapes, and two ways to supply them:
//  - a service account key ("type": "service_account") -> signed JWT
//  - a gcloud ADC user credential ("type": "authorized_user") -> refresh token
//    (what `gcloud auth application-default login` produces, needed when an
//    org policy blocks service account key creation)
// GOOGLE_APPLICATION_CREDENTIALS_JSON holds the whole JSON inline (for
// serverless hosts with no persistent disk to put a key file on).
// GOOGLE_APPLICATION_CREDENTIALS holds a path to the file instead (local dev).
import { readFileSync } from "fs";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function loadCredentials(): Record<string, string> {
  const inlineJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (inlineJson) return JSON.parse(inlineJson);

  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) {
    throw new Error(
      "Set either GOOGLE_APPLICATION_CREDENTIALS_JSON (the whole key file's contents) or GOOGLE_APPLICATION_CREDENTIALS (a path to it)."
    );
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

async function getAccessTokenViaServiceAccount(client_email: string, private_key: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64url(
    Buffer.from(JSON.stringify({ iss: client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }))
  );
  const { createSign } = await import("crypto");
  const signature = base64url(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(private_key));
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function getAccessTokenViaRefreshToken(client_id: string, client_secret: string, refresh_token: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id, client_secret, refresh_token }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function getAccessToken(): Promise<string> {
  const creds = loadCredentials();
  if (creds.type === "authorized_user") {
    return getAccessTokenViaRefreshToken(creds.client_id, creds.client_secret, creds.refresh_token);
  }
  return getAccessTokenViaServiceAccount(creds.client_email, creds.private_key);
}

export async function writeSheetRows(spreadsheetId: string, sheetName: string, header: string[], rows: string[][]) {
  const token = await getAccessToken();
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Clear the sheet first so a re-export doesn't leave stale trailing rows
  // from a previous, longer run.
  const clearRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:clear`,
    { method: "POST", headers: authHeaders, body: "{}" }
  );
  if (!clearRes.ok) throw new Error(`Sheets clear failed ${clearRes.status}: ${await clearRes.text()}`);

  const range = `${sheetName}!A1`;
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", headers: authHeaders, body: JSON.stringify({ values: [header, ...rows] }) }
  );
  if (!updateRes.ok) throw new Error(`Sheets update failed ${updateRes.status}: ${await updateRes.text()}`);
}
