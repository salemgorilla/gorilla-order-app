import { list } from "@vercel/blob";

/**
 * IS THE BLOB STORE ACTUALLY THERE?
 *
 * ── WHY A VARIABLE CHECK WAS NOT ENOUGH ───────────────────────────────────
 * /api/artwork-upload reported `configured: Boolean(BLOB_READ_WRITE_TOKEN)`.
 * On 2026-09-01 that answered TRUE while production logged, on a real
 * customer's submission:
 *
 *   ARTWORK DIRECT UPLOAD FAILED in the customer's browser:
 *   "IMG_0528.jpeg" — Vercel Blob: This store does not exist.
 *
 * The token existed. The store it named did not. Every direct upload was
 * failing and the health endpoint called it configured.
 *
 * That is not a cosmetic wrong answer, because the browser reads it: the
 * upload box advertises "Maximum file size: 100 MB" when this says
 * configured, and 3.5 MB when it does not. So a broken store made the app
 * promise a 100 MB ceiling while the real one was 3.5 MB — and anything
 * over 3.5 MB is DROPPED from the quote (lib/upload-limits.ts). Stuart
 * Hinton's file was 204 KB and fit. The next one might not.
 *
 * `configured` now means "an upload will succeed", which is the only thing
 * anyone ever wanted it to mean. A credential that names something absent
 * is not configuration.
 *
 * ── WHY IT IS CACHED ──────────────────────────────────────────────────────
 * Every visitor's browser calls the endpoint on page load. A store probe on
 * each one is a network round-trip per pageview for an answer that changes
 * about once a month. The result is held for a minute — long enough that a
 * busy hour costs one probe, short enough that fixing the store in the
 * dashboard shows up while Gabe is still looking at the screen.
 *
 * A FAILURE IS CACHED FOR LESS TIME THAN A SUCCESS: the interesting moment
 * is the one just after someone reconnects a store, and waiting a full
 * minute to see it is how a fix gets mistaken for a non-fix.
 */

export type BlobHealth = {
  /** True only when the store answered. */
  reachable: boolean;
  /** Why not, verbatim from the SDK. Null when reachable. */
  error: string | null;
  /** False when there is no read-write token set. NOT the same as unusable. */
  hasToken: boolean;
  /**
   * WHICH credential the SDK will actually use — the thing this probe was
   * getting wrong. See readBlobCredential.
   */
  credential: BlobCredential;
  /**
   * CAN A CUSTOMER'S BROWSER UPLOAD? Not the same as `reachable`, and the
   * difference is customer-facing.
   *
   * It used to require a parseable BLOB_READ_WRITE_TOKEN, because the old
   * client-upload path (handleUpload) resolved through
   * getReadWriteBlobTokenFromOptionsOrEnv, which has no OIDC branch. So a
   * project on OIDC with a broken token had a perfectly healthy store AND
   * broken client uploads at the same time — and on 2026-09-23 this
   * endpoint briefly reported `configured: true` in exactly that state,
   * which is the 1 Sep failure again: box advertises 100 MB, real ceiling
   * is 3.5 MB, anything above it dropped from the quote.
   *
   * The route now uses handleUploadPresigned + issueSignedToken, which
   * resolve through BlobCommandOptions and prefer OIDC. So the requirement
   * is no longer a static token — it is a credential of EITHER kind, plus
   * BLOB_WEBHOOK_PUBLIC_KEY, which handleUploadPresigned throws without
   * even when no completion callback is used.
   *
   * `configured` reads THIS field, never `reachable && a token exists`.
   */
  clientUploadsReady: boolean;
  /**
   * The store the TOKEN belongs to, next to the store the PROJECT names.
   *
   * Both are store ids, not secrets — BLOB_STORE_ID is a plain environment
   * variable anyone with dashboard access reads, and the token carries the
   * same id in its third segment. Nothing after that segment is ever read
   * or reported. See readTokenStoreId.
   */
  tokenStoreId: string | null;
  projectStoreId: string | null;
  /**
   * HOW the token is malformed, when it is. Null when it parsed, and null
   * when there is no token at all — both are already fully explained.
   *
   * Counts and booleans only; see TokenShape for why it can never carry a
   * character of the credential.
   */
  tokenShape: TokenShape | null;
};

/**
 * WHICH CREDENTIAL WILL THE SDK ACTUALLY USE?
 *
 * ── THE BUG THIS EXISTS FOR ───────────────────────────────────────────────
 * This file probed the store by passing `token: BLOB_READ_WRITE_TOKEN`
 * explicitly. Nothing else in the app does that — every other blob call
 * (lib/subscriber-store.ts, the dropoff and handoff routes) calls `list`
 * and `put` with no token at all and lets the SDK resolve credentials.
 *
 * Those are not the same question, because the SDK prefers OIDC:
 *
 *   resolveBlobAuth (chunk-OYCIHDFF.js:161)
 *     1. options.token          ← only when passed EXPLICITLY
 *     2. VERCEL_OIDC_TOKEN + BLOB_STORE_ID
 *     3. env BLOB_READ_WRITE_TOKEN
 *
 * So a project holding a broken read-write token and a working OIDC pair
 * runs fine everywhere — and this probe, alone, forced itself onto the
 * broken credential and reported the whole store dead. The health check was
 * the only thing failing, and it was failing because of how it asked.
 *
 * The probe now asks the way the app asks. This function exists to say
 * which credential answered, because "it works" and "it works via OIDC" are
 * different facts and the second one is the one that survives a token being
 * deleted.
 */
export type BlobCredential = "oidc" | "read-write" | "none";

/**
 * NOTE — WHY THIS CANNOT SIMPLY READ THE ENV.
 *
 * On Vercel the OIDC token is delivered PER REQUEST as the
 * `x-vercel-oidc-token` header; `process.env.VERCEL_OIDC_TOKEN` is only a
 * fallback (@vercel/oidc, get-vercel-oidc-token-sync.js:26). So an env read
 * alone reports "read-write" on a deployment that is in fact authenticating
 * with OIDC — which this file did, for one deployment, on 2026-09-23.
 *
 * The header is not visible from here, so the honest resolution uses the
 * probe's own RESULT: if the store answered and the read-write token cannot
 * even be parsed, the credential that answered was necessarily OIDC. That
 * is elimination, not a guess. See creditFor.
 */
export function readBlobCredential(): BlobCredential {
  const oidcEnv = process.env.VERCEL_OIDC_TOKEN?.trim();
  const storeId = process.env.BLOB_STORE_ID?.trim();
  const readWrite = process.env.BLOB_READ_WRITE_TOKEN?.trim();

  /**
   * BLOB_STORE_ID IS THE DURABLE SIGNAL, NOT VERCEL_OIDC_TOKEN.
   *
   * This checked `VERCEL_OIDC_TOKEN && BLOB_STORE_ID` and would have taken
   * the whole upload path down the moment the leftover read-write token was
   * deleted — which is the exact clean-up this migration asks for.
   *
   * On Vercel the OIDC token arrives as the per-request
   * `x-vercel-oidc-token` header; `process.env.VERCEL_OIDC_TOKEN` is only a
   * fallback (@vercel/oidc, get-vercel-oidc-token-sync.js:26). So on a live
   * deployment that env var is EMPTY while OIDC works perfectly. Requiring
   * it meant: delete the dead token, redeploy, and readBlobCredential
   * returns "none" — which skips the probe, forces clientUploadsReady
   * false, and makes the upload route answer 501 to every customer.
   *
   * The store id is what the connect flow writes and what OIDC is scoped
   * to, so a connected store plus a Vercel runtime IS the OIDC case. Where
   * neither is certain the probe decides, which is the right arbiter — a
   * credential that cannot authenticate shows up as a failed probe rather
   * than as a guess made here.
   */
  if (storeId && (oidcEnv || process.env.VERCEL)) return "oidc";

  // Local dev with a real token and no OIDC runtime.
  if (readWrite) return "read-write";

  // A store id and nothing else: report it and let the probe be the judge.
  if (storeId) return "oidc";

  return "none";
}

/**
 * WHICH STORE DOES THIS TOKEN BELONG TO?
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * A blob token is `vercel_blob_rw_<storeId>_<secret>`. When it does not
 * match the store the project names, every call fails with:
 *
 *   Vercel Blob: Access denied, please provide a valid token for this resource.
 *
 * Which is true, and useless. It is the same sentence you get for a revoked
 * token, an expired one, or one from another team — so the reader is left
 * guessing, and the guesses are all dashboard work. Gabe spent the better
 * part of two days on exactly that loop: reconnecting a store that was
 * healthy, and re-pasting a token that belonged to something else.
 *
 * The app had the answer the whole time. The token names its store; the
 * project names its store; comparing them is a string comparison. It just
 * never looked.
 *
 * ── WHAT IT WILL AND WILL NOT READ ────────────────────────────────────────
 * The third underscore-separated segment, and nothing else. The secret is
 * the fourth segment onward and is never touched, never logged and never
 * returned. A token of an unexpected shape returns null rather than a
 * guess — a wrong store id in a diagnostic is worse than none.
 */
export function readTokenStoreId(token: string | undefined): string | null {
  const parts = String(token ?? "").split("_");

  // vercel / blob / rw / <storeId> / <secret…>
  if (parts.length < 5) return null;
  if (parts[0] !== "vercel" || parts[1] !== "blob" || parts[2] !== "rw") return null;

  const id = parts[3];

  return /^[A-Za-z0-9]{8,40}$/.test(id) ? id : null;
}

/**
 * WHAT IS WRONG WITH THE TOKEN, WITHOUT READING THE TOKEN.
 *
 * ── WHY COUNTS AND BOOLEANS, NOT CONTENT ──────────────────────────────────
 * When readTokenStoreId returns null the value in BLOB_READ_WRITE_TOKEN is
 * not a blob token, and the next question is always the same: not a blob
 * token HOW. Quotation marks from a pasted .env line, the variable name
 * pasted along with the value, a truncated copy, a leading newline — every
 * one of them is invisible in the Vercel UI, which renders the value as
 * dots, and every one produces the identical "Access denied".
 *
 * None of that needs the value itself. A length, a segment count and four
 * booleans separate all of them, and none of them can be run backwards into
 * a credential. Nothing here returns a character of the token.
 *
 * Reported ONLY when the token fails to parse. A token that parses has
 * nothing to explain, and a healthy deployment should not be publishing a
 * character count of its credential to every visitor for no reason.
 */
export type TokenShape = {
  /** Characters as stored. Zero means the variable is set and empty. */
  length: number;
  /** Underscore-separated parts. A read-write token has at least five. */
  segments: number;
  /** Does it start with `vercel_blob_rw_`? */
  hasPrefix: boolean;
  /** Whitespace at either end — invisible in the UI and in the error. */
  hasSurroundingWhitespace: boolean;
  /** A quote at either end: a .env line pasted with its quoting intact. */
  hasQuotes: boolean;
  /** The variable's own NAME pasted in front of its value. */
  hasVariableName: boolean;
};

export function describeTokenShape(token: string): TokenShape {
  const trimmed = token.trim();
  const unquoted = trimmed.replace(/^["']|["']$/g, "");

  return {
    length: token.length,
    segments: token.split("_").length,
    hasPrefix: token.startsWith("vercel_blob_rw_"),
    hasSurroundingWhitespace: trimmed.length !== token.length,
    hasQuotes: unquoted.length !== trimmed.length,
    hasVariableName: /^\s*["']?BLOB_READ_WRITE_TOKEN\s*=/.test(token),
  };
}

const OK_TTL_MS = 60_000;
const FAIL_TTL_MS = 10_000;

/**
 * How long the probe gets before it is called a failure.
 *
 * NOT optional, and NOT delegated. The SDK retries a network error TEN
 * times with backoff (VERCEL_BLOB_RETRIES defaults to "10"), so an
 * unreachable store holds the call for minutes — and this call is on the
 * page-load path for every visitor, which would turn a degraded store into
 * a hung artwork step.
 *
 * The SDK takes an `abortSignal` and it is passed one, but the deadline is
 * ALSO enforced here with a race. Measured: against a black-holed network,
 * `list` with AbortSignal.timeout(3000) had not returned 45 seconds later.
 * Whatever the reason, a health check's latency has to be bounded by code
 * this file controls rather than by a promise made in a dependency.
 *
 * Five seconds is far longer than a healthy list of one blob, and far
 * shorter than anyone will wait to be told a file size limit.
 */
const PROBE_TIMEOUT_MS = 5_000;

/** The sentence reported when the deadline, not the store, ended the probe. */
export const PROBE_TIMEOUT_MESSAGE = "The blob store did not answer in time.";

let cached: { at: number; value: BlobHealth } | null = null;

/**
 * The probe currently in flight, shared.
 *
 * Without this, a burst of visitors on a cold cache each start their own
 * probe — and against a slow store they all wait the full timeout instead
 * of one of them waiting and the rest reading the answer.
 */
let inFlight: Promise<BlobHealth> | null = null;

/** Drops the cache. For tests, and for a caller that must not see a stale yes. */
export function resetBlobHealthCache() {
  cached = null;
  inFlight = null;
}

/**
 * Ask the store whether it exists — see listOneBlob for the question.
 *
 * NEVER THROWS. This is a health check — it reports a failure, it does not
 * become one. A probe that threw would take out the endpoint the upload box
 * reads, and the box would then fall back to... calling the store broken,
 * which is the right answer arrived at the wrong way.
 */
export async function checkBlobStore(
  options: {
    /** Clock, for the cache windows. */
    now?: number;
    /**
     * The call that asks the store. Injected ONLY so the caching, the
     * deadline and the reporting can be tested without a network.
     *
     * It has to be INJECTED rather than stubbed: the SDK issues its request
     * through `undici.fetch`, not `globalThis.fetch`, so replacing the
     * global does nothing and the "stubbed" test quietly hits the real
     * Vercel Blob API and hangs. It did, for two debugging rounds. That is
     * why this parameter exists.
     */
    ask?: () => Promise<void>;
    /** Shorter deadline, for tests. Production uses PROBE_TIMEOUT_MS. */
    timeoutMs?: number;
  } = {}
): Promise<BlobHealth> {
  const now = options.now ?? Date.now();
  const ask = options.ask ?? listOneBlob;
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  const credential = readBlobCredential();

  if (credential === "none") {
    // Nothing to probe WITH. Not "the store is broken" — there is no
    // credential of either kind, which is a different sentence and a
    // different fix. No probe to run, and no cache: the answer is free.
    return {
      reachable: false,
      error: null,
      hasToken: false,
      credential,
      clientUploadsReady: false,
      tokenStoreId: null,
      projectStoreId: readProjectStoreId(),
      tokenShape: null,
    };
  }

  if (cached) {
    const ttl = cached.value.reachable ? OK_TTL_MS : FAIL_TTL_MS;
    if (now - cached.at < ttl) return cached.value;
  }

  if (inFlight) return inFlight;

  inFlight = probe(ask, timeoutMs)
    .then((value) => {
      cached = { at: now, value };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * The real question, in one line: list one blob.
 *
 * `list` rather than `head` — head needs a key that exists, and an empty
 * store is a perfectly healthy store. Limit 1 keeps it the cheapest call
 * that still proves the store answers.
 */
async function listOneBlob(): Promise<void> {
  await list({
    limit: 1,
    // NO `token`. That is the point — see readBlobCredential. Passing one
    // explicitly overrides OIDC and probes a credential the rest of the app
    // never uses, which is how this check spent days reporting a dead store
    // that every other blob call in the project was reading fine.
    //
    // Passed so the SDK can abandon its own request and stop retrying. The
    // deadline that actually holds is the race in probe() — see
    // PROBE_TIMEOUT_MS for the measurement behind that.
    abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
}

/**
 * The deadline, enforced here rather than trusted to the caller's signal.
 *
 * The losing promise is left to settle on its own: there is nothing to
 * clean up (the probe writes to nothing) and rejecting it unhandled would
 * take the process down. `.catch(() => {})` is the whole cleanup.
 */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  work.catch(() => {});

  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error(PROBE_TIMEOUT_MESSAGE)),
        ms
      );
      // Never hold a serverless invocation open for a health check.
      timer.unref?.();
    }),
  ]);
}

async function probe(
  ask: () => Promise<void>,
  timeoutMs: number
): Promise<BlobHealth> {
  const hasToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const ids = storeIds();

  // What the presigned route actually needs. NOT a static token — see
  // clientUploadsReady, and app/api/artwork-upload/route.ts for why that
  // dependency was removed rather than repaired.
  const clientUploadsReady = readClientUploadsReady();

  try {
    await withDeadline(ask(), timeoutMs);

    return {
      reachable: true,
      error: null,
      hasToken,
      credential: creditFor(true, ids.tokenStoreId),
      clientUploadsReady,
      ...ids,
    };
  } catch (error) {
    return {
      reachable: false,
      // The SDK's own words. "This store does not exist" is the sentence
      // that names the fix, and paraphrasing it would have cost a week.
      error: error instanceof Error ? error.message : String(error),
      hasToken,
      credential: creditFor(false, ids.tokenStoreId),
      clientUploadsReady,
      ...ids,
    };
  }
}

/**
 * Which credential answered, established by elimination where it can be.
 *
 * The env read cannot see the per-request OIDC header (see
 * readBlobCredential), so it under-reports OIDC. But a store that ANSWERED
 * on a deployment whose read-write token does not even parse cannot have
 * been reached with that token — the credential was OIDC, proven, not
 * guessed. That is the exact state this project is in, and reporting it as
 * "read-write" sent a day into the wrong variable.
 */
/**
 * Everything handleUploadPresigned needs, and nothing it does not.
 *
 * The webhook key is not optional: handleUploadPresigned reads
 * BLOB_WEBHOOK_PUBLIC_KEY and throws "Missing webhook public key" before it
 * looks at anything else, even with no onUploadCompleted callback wired up.
 * Vercel writes it when a store is connected, next to BLOB_STORE_ID — so a
 * project missing it has a half-finished connection, which is worth saying
 * out loud rather than discovering in a customer's browser.
 */
export function readClientUploadsReady(): boolean {
  return (
    readBlobCredential() !== "none" &&
    Boolean(process.env.BLOB_WEBHOOK_PUBLIC_KEY?.trim())
  );
}

function creditFor(reachable: boolean, tokenStoreId: string | null): BlobCredential {
  if (reachable && !tokenStoreId) return "oidc";
  return readBlobCredential();
}

/**
 * The two store ids, read the same way on every path.
 *
 * Reported whether the probe passed or failed. A reachable store whose ids
 * disagree is worth seeing too: it means the project is holding a
 * BLOB_STORE_ID that no longer describes where the files are going, and the
 * next person to trust that variable is debugging the wrong store.
 */
function storeIds(): Pick<
  BlobHealth,
  "tokenStoreId" | "projectStoreId" | "tokenShape"
> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const tokenStoreId = readTokenStoreId(token);

  return {
    tokenStoreId,
    projectStoreId: readProjectStoreId(),
    // Only when there is a token AND something to explain about it — see
    // TokenShape. A project running on OIDC with no token at all has no
    // shape to report, and reporting one would invent a problem.
    tokenShape: token && !tokenStoreId ? describeTokenShape(token) : null,
  };
}

/**
 * BLOB_STORE_ID, in the same spelling the token uses.
 *
 * ── WHY IT IS NOT JUST `.trim()` ──────────────────────────────────────────
 * The two sources disagree on the prefix. Vercel writes BLOB_STORE_ID as
 * `store_X548kEBykUffj6EJ`, and the token embeds the same store as
 * `…_rw_X548kEBykUffj6EJ_…` with no prefix. The SDK itself reconciles them
 * (normalizeStoreId strips `store_` before use), and anything that compares
 * the raw strings reports a mismatch on a perfectly correct pair.
 *
 * That wrong answer would be worse than no answer: the whole point of this
 * diagnostic is to stop someone re-pasting a token that was fine.
 */
function readProjectStoreId(): string | null {
  const raw = process.env.BLOB_STORE_ID?.trim();
  if (!raw) return null;

  return raw.startsWith("store_") ? raw.slice("store_".length) : raw;
}

/**
 * What to tell someone reading the health endpoint — one sentence naming
 * the next action, not a status word.
 */
export function describeBlobHealth(health: BlobHealth): string | null {
  if (health.reachable) return null;

  if (health.credential === "none") {
    return (
      "No blob credential of either kind is set. Connect a blob store in " +
      "Vercel → Storage, which provisions BLOB_STORE_ID, and redeploy so " +
      "the deployment is issued a VERCEL_OIDC_TOKEN. A static " +
      "BLOB_READ_WRITE_TOKEN also works but is not required."
    );
  }

  // The store the token names is gone, or the token is stale. Both look the
  // same from the dashboard, where the store row appears perfectly healthy.
  //
  // The timeout message is already a full sentence about the store, so it
  // is used as-is rather than wrapped in a second one — "The blob store did
  // not answer: The blob store did not answer in time.." is how a health
  // endpoint stops being read.
  const what =
    health.error === PROBE_TIMEOUT_MESSAGE
      ? health.error
      : `The blob store did not answer: ${health.error}.`;

  return `${what} ${nextAction(health)}`;
}

/**
 * WHICH DASHBOARD ACTION, given what the two store ids say.
 *
 * ── WHY THE GENERIC ADVICE WAS NOT ENOUGH ─────────────────────────────────
 * "Reconnect the store and redeploy" is the right answer to one of these
 * failures and a waste of an afternoon for the other two. The SDK cannot
 * tell them apart — every one of them comes back as:
 *
 *   Vercel Blob: Access denied, please provide a valid token for this resource.
 *
 * The app can. A read-write token names its store in plain text, the
 * project names its store in BLOB_STORE_ID, and the Connect-to-Project
 * button is what writes the second one. So when they disagree, the store is
 * fine and the PASTED TOKEN is from somewhere else — which is the one
 * conclusion nobody reaches by staring at the dashboard, because the store
 * row looks healthy in every single case.
 *
 * Two days went into that loop here: reconnecting a store that was never
 * broken, and re-pasting a token that belonged to another store.
 */
/**
 * The one sentence that ends the guessing, chosen from the shape.
 *
 * Ordered by how often each one has actually happened to a pasted
 * credential, and only ONE is reported: a list of four maybes is how a
 * diagnostic gets skimmed past. Falls back to the raw measurements, which
 * are still enough to recognise a truncated paste from an empty box.
 */
function namePasteDefect(shape: TokenShape | null): string {
  if (!shape) return "";

  if (shape.length === 0) {
    return "The variable is set to an empty value.";
  }

  if (shape.hasVariableName) {
    return (
      "It begins with the variable's own name, so a whole .env line was " +
      "pasted into the value box — Vercel wants the value only."
    );
  }

  if (shape.hasQuotes) {
    return (
      "It begins or ends with a quotation mark, which a .env line carries " +
      "and Vercel does not strip."
    );
  }

  if (shape.hasSurroundingWhitespace) {
    return (
      "It has whitespace at one end — a space or a newline that came along " +
      "with the copy and is invisible in the dashboard."
    );
  }

  if (!shape.hasPrefix) {
    return (
      "It does not begin vercel_blob_rw_, so this is not a blob read-write " +
      "token at all — check it was copied from the store's .env.local tab " +
      "and not from somewhere else."
    );
  }

  if (shape.segments < 5) {
    return `It has ${shape.segments} underscore-separated parts and a token has at least five, so the copy was cut short.`;
  }

  return `It is ${shape.length} characters in ${shape.segments} parts, and the store ID between vercel_blob_rw_ and the next underscore is not a valid one.`;
}

function nextAction(health: BlobHealth): string {
  // OIDC failing is a different animal from a bad token, and the token
  // diagnostics below would send the reader to a credential the SDK did not
  // even use. Which credential answered is the first thing to establish.
  if (health.credential === "oidc") {
    return (
      `The deployment authenticated with OIDC against store ` +
      `${health.projectStoreId ?? "(BLOB_STORE_ID unset)"} and the store ` +
      "still refused it. BLOB_READ_WRITE_TOKEN is not involved and " +
      "replacing it will not help. Check that the store named by " +
      "BLOB_STORE_ID still exists and is connected to this project in " +
      "Vercel → Storage, then redeploy. " +
      "Until then the app correctly advertises the smaller inline limit " +
      "and artwork over it is collected by email."
    );
  }

  const meanwhile =
    "Until then the app correctly advertises the smaller inline limit and " +
    "artwork over it is collected by email.";

  // A token that is not shaped like a token. Usually a paste that brought
  // quotation marks, a newline, or only half the string with it — all three
  // invisible in the Vercel UI, which shows the value as dots.
  if (!health.tokenStoreId) {
    return (
      "BLOB_READ_WRITE_TOKEN is set but is not shaped like a blob token: it " +
      `should read vercel_blob_rw_<store>_<secret>. ${namePasteDefect(health.tokenShape)} ` +
      "Replace the whole value with a freshly copied token and redeploy. " +
      meanwhile
    );
  }

  if (health.projectStoreId && health.projectStoreId !== health.tokenStoreId) {
    return (
      `That token belongs to store ${health.tokenStoreId}, but this project ` +
      `is connected to store ${health.projectStoreId}. The store is fine — ` +
      "the token is from a different one. Open Vercel → Storage → the store " +
      `whose ID ends ${health.projectStoreId}, copy its read-write token, ` +
      "replace BLOB_READ_WRITE_TOKEN in Production with it, and redeploy. " +
      meanwhile
    );
  }

  // The ids agree, or there is nothing to compare against. The credential
  // itself is the suspect: revoked, rotated, or left behind by a store that
  // was deleted and recreated under the same name.
  //
  // The two cases are worded apart because only one of them has actually
  // ruled the store id out. Claiming a match that was never checked is how
  // a diagnostic starts sending people past the real fault.
  const named = health.projectStoreId
    ? `The token names store ${health.tokenStoreId}, which is the store this ` +
      "project is connected to, so the ID is not the problem — the " +
      "credential is."
    : `The token names store ${health.tokenStoreId}, and BLOB_STORE_ID is ` +
      "not set, so there is nothing to check it against.";

  return (
    `${named} In Vercel → Storage open that store, generate a fresh ` +
    "read-write token, replace BLOB_READ_WRITE_TOKEN in Production with it, " +
    "and redeploy. A store that was deleted and recreated gets a new ID and " +
    `a new token. ${meanwhile}`
  );
}
