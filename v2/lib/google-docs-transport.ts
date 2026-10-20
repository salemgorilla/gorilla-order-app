/**
 * THE GOOGLE DOC, REACHED AS A SERVICE ACCOUNT.
 *
 * The thin shell around the two operations lib/subscriber-ledger.ts needs:
 * read the document's text, and add a line at the end. Everything about WHAT
 * is written lives in the ledger; this file only knows how to talk to Google.
 *
 * ── WHY A SERVICE ACCOUNT ─────────────────────────────────────────────────
 * It is a robot identity with an email address of its own. The Doc is shared
 * with that address, exactly as it would be shared with a person, and the
 * robot can reach that Doc and nothing else in the shop's Google account. No
 * public endpoint exists that could be asked for the list, no one's password
 * is stored, and revoking access is unsharing the Doc.
 *
 * ── THE CREDENTIAL ────────────────────────────────────────────────────────
 * GOOGLE_SERVICE_ACCOUNT_JSON  the key file Google downloads, pasted whole.
 * SUBSCRIBER_DOC_ID            the long id in the Doc's address.
 *
 * Read with .trim(), like every secret here: a trailing newline from a paste
 * is invisible and has already cost this project days once.
 *
 * ── EVERY FAILURE SAYS WHY ────────────────────────────────────────────────
 * A rejected call throws with Google's own explanation in it. It ends up in
 * the shop email's Newsletter row (see lib/subscriber-store.ts and
 * lib/newsletter.ts), which is the one place a failed sign-up is still
 * visible after Vercel deletes its logs. "The caller does not have
 * permission" means the Doc was not shared with the robot; "has not been
 * used in project" means the Docs API was not switched on. Either is a
 * thirty-second fix, but only if the message survives.
 *
 * SERVER ONLY. This imports node:crypto to sign the sign-in; a browser-
 * reachable module that imports it kills the build (lib/dropoff.ts learned
 * that). Nothing client-side imports lib/subscriber-store.ts.
 */

import { createSign } from "node:crypto";

import type { LedgerTransport } from "./subscriber-ledger";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DOCS_URL = "https://docs.googleapis.com/v1/documents";
const SCOPE = "https://www.googleapis.com/auth/documents";

/**
 * How long any single call to Google may take.
 *
 * The sign-up on the order path is ALSO raced against a deadline in
 * lib/newsletter.ts, which is what actually protects the shop's email. This
 * is the backstop for the callers that have no such race (the unsubscribe
 * link, the admin export), where a hang would be a customer staring at a
 * spinner.
 */
export const GOOGLE_CALL_TIMEOUT_MS = 6_000;

export type ServiceAccount = { clientEmail: string; privateKey: string };

export type GoogleDocConfig =
  | { state: "off" }
  | { state: "ready"; account: ServiceAccount; docId: string }
  | { state: "broken"; reason: string };

/**
 * Whether the Doc store is configured, half-configured, or not at all.
 *
 * HALF-CONFIGURED IS ITS OWN STATE, and not "off". Setting one of the two
 * variables and mistyping the other is exactly how this goes wrong, and
 * treating it as off would quietly fall back to a store that is known not to
 * work and report THAT error instead — pointing at the wrong thing. A broken
 * configuration is reported as itself.
 */
export function readGoogleDocConfig(
  env: Record<string, string | undefined> = process.env
): GoogleDocConfig {
  const rawJson = String(env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "").trim();
  const docId = String(env.SUBSCRIBER_DOC_ID ?? "").trim();

  if (!rawJson && !docId) return { state: "off" };

  if (!rawJson) {
    return { state: "broken", reason: "SUBSCRIBER_DOC_ID is set but GOOGLE_SERVICE_ACCOUNT_JSON is not." };
  }

  if (!docId) {
    return { state: "broken", reason: "GOOGLE_SERVICE_ACCOUNT_JSON is set but SUBSCRIBER_DOC_ID is not." };
  }

  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    return {
      state: "broken",
      reason:
        "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the whole key file Google downloaded, braces included.",
    };
  }

  const clientEmail = String(parsed.client_email ?? "").trim();
  // Some paste paths turn the key's \n escapes into literal backslash-n.
  const privateKey = String(parsed.private_key ?? "").replace(/\\n/g, "\n").trim();

  if (!clientEmail.includes("@")) {
    return { state: "broken", reason: "GOOGLE_SERVICE_ACCOUNT_JSON has no client_email." };
  }

  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    return { state: "broken", reason: "GOOGLE_SERVICE_ACCOUNT_JSON has no private_key." };
  }

  return { state: "ready", account: { clientEmail, privateKey }, docId };
}

const base64url = (input: string | Buffer) =>
  Buffer.from(input).toString("base64url");

/** The signed request Google exchanges for an access token. */
export function signServiceAccountJwt(
  account: ServiceAccount,
  nowSeconds: number
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    })
  );

  const signature = createSign("RSA-SHA256")
    .update(`${header}.${claim}`)
    .sign(account.privateKey);

  return `${header}.${claim}.${base64url(signature)}`;
}

/** A Google error body, boiled down to the sentence a person needs. */
async function explain(response: Response): Promise<string> {
  let detail = "";

  try {
    const body = (await response.json()) as {
      error?: { message?: string } | string;
      error_description?: string;
    };

    detail =
      typeof body.error === "string"
        ? [body.error, body.error_description].filter(Boolean).join(": ")
        : body.error?.message ?? "";
  } catch {
    // Not JSON. The status line is all there is.
  }

  return `${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`.slice(0, 300);
}

/** What the document body says, as plain text with one line per paragraph. */
export function textOfDocument(doc: unknown): string {
  const content = ((doc as { body?: { content?: unknown[] } })?.body?.content ?? []) as Array<{
    paragraph?: { elements?: Array<{ textRun?: { content?: string } }> };
  }>;

  return content
    .map((block) =>
      (block.paragraph?.elements ?? []).map((element) => element.textRun?.content ?? "").join("")
    )
    .join("");
}

type CachedToken = { value: string; expiresAt: number };

/**
 * One access token is good for an hour; asking for a new one on every call
 * would triple the round trips on the order path. Held per serverless
 * instance, which is imprecise and entirely sufficient — the worst case is a
 * few more sign-ins than strictly needed.
 */
let cachedToken: CachedToken | null = null;

/** For tests. */
export function resetGoogleTokenCache(): void {
  cachedToken = null;
}

export function googleDocTransport(
  config: { account: ServiceAccount; docId: string },
  fetchImpl: typeof fetch = fetch,
  now: () => number = () => Date.now()
): LedgerTransport {
  async function accessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt - 60_000 > now()) return cachedToken.value;

    const assertion = signServiceAccountJwt(config.account, Math.floor(now() / 1000));

    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(GOOGLE_CALL_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`Google sign-in: ${await explain(response)}`);

    const body = (await response.json()) as { access_token?: string; expires_in?: number };

    if (!body.access_token) throw new Error("Google sign-in: no access token in the reply.");

    cachedToken = {
      value: body.access_token,
      expiresAt: now() + (body.expires_in ?? 3600) * 1000,
    };

    return cachedToken.value;
  }

  const documentUrl = `${DOCS_URL}/${encodeURIComponent(config.docId)}`;

  return {
    async readText() {
      const response = await fetchImpl(documentUrl, {
        headers: { Authorization: `Bearer ${await accessToken()}` },
        signal: AbortSignal.timeout(GOOGLE_CALL_TIMEOUT_MS),
      });

      if (!response.ok) throw new Error(`Google Docs read: ${await explain(response)}`);

      return textOfDocument(await response.json());
    },

    async append(line) {
      const response = await fetchImpl(`${documentUrl}:batchUpdate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          "Content-Type": "application/json",
        },
        // The break goes BEFORE the line: a document always ends in a newline
        // that cannot be removed, and text inserted at the end of the body
        // lands just ahead of it. "\n" + line makes a new paragraph; "line\n"
        // would leave a blank one after it.
        body: JSON.stringify({
          requests: [{ insertText: { endOfSegmentLocation: {}, text: `\n${line}` } }],
        }),
        signal: AbortSignal.timeout(GOOGLE_CALL_TIMEOUT_MS),
      });

      if (!response.ok) throw new Error(`Google Docs write: ${await explain(response)}`);
    },
  };
}
