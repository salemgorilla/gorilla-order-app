/**
 * THE LIST, KEPT HERE RATHER THAN AT A COMPANY THAT CAN CHANGE ITS MIND.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * Gabe, 2026-09-10: "I quit constant contact. Is there an app you can build
 * that works on my website but behind the scenes?"
 *
 * Every sign-up this app has ever taken went to a Zapier hook, which handed
 * it to Constant Contact. The hook is gone, and with it the only place a
 * subscriber was ever stored — the app itself kept nothing. A customer
 * ticked a box, the shop email said "Opted in", and the record of that
 * consent existed nowhere either party controlled.
 *
 * So the list lives in the shop's own blob store now. No third party holds
 * it, which makes the promise the confirmation email started making on
 * 9 Sep — "we will not sell your information" — true by construction rather
 * than by policy: there is no mechanism in this app that hands a subscriber
 * to anyone.
 *
 * ── ONE BLOB PER SUBSCRIBER, NOT ONE LIST FILE ───────────────────────────
 * A single subscribers.json would need read-modify-write on every sign-up,
 * and two quotes submitted in the same second would silently drop one of
 * them — the kind of loss nobody notices for months because the failure
 * looks exactly like "not many people signed up".
 *
 * Keyed by a hash of the address, each write is independent and idempotent:
 * the same person signing up twice rewrites one record instead of making
 * two, and no write can clobber another person's.
 *
 * ── PRIVATE BLOBS, DELIBERATELY ──────────────────────────────────────────
 * `access: "private"`. A public blob URL is unguessable but it is still a
 * URL, and what is stored here is a list of customers' email addresses.
 * Unguessable is not the same as private, and the difference is one leaked
 * pathname.
 *
 * ── AN UNSUBSCRIBE IS STICKY, AND THAT IS THE IMPORTANT RULE ─────────────
 * The newsletter box arrives PRE-TICKED. Without this rule, somebody who
 * unsubscribes and later orders again is silently put back on the list by a
 * box they never touched — and the second time, they do not unsubscribe,
 * they press "spam". Gmail throttles a sending domain at a complaint rate
 * of 0.3%, which is three people in a thousand.
 *
 * So `unsubscribedAt` is never cleared by an ordinary opt-in. The attempt is
 * recorded (`resubscribeAttemptedAt`) so the shop can see somebody appears
 * to want back in and ask them properly, which is the only way back on.
 */

import { createHash } from "node:crypto";

/**
 * The three operations this file needs from a blob store.
 *
 * INJECTED rather than imported, for the reason lib/blob-health.ts learned
 * the hard way: the Vercel SDK issues its requests through undici's fetch,
 * not the global one, so a test cannot stub it and a test that tries hangs
 * until it is killed. A three-method interface can be driven by a Map.
 */
export type SubscriberStore = {
  put(pathname: string, body: string): Promise<void>;
  read(pathname: string): Promise<string | null>;
  list(prefix: string, cursor?: string): Promise<{ pathnames: string[]; cursor?: string }>;
};

export type SubscriberRecord = {
  email: string;
  name: string;
  company: string;
  /** How they said they found the shop. Segmenting, not identity. */
  heardAbout: string[];
  /** When they first opted in. Never overwritten by a later sign-up. */
  optedInAt: string;
  /** Where the opt-in happened — the quote builder, the counter, the site. */
  source: string;
  /** True when the box arrived already ticked. The ESP's first question. */
  preChecked: boolean;
  /** The quote it came in on, so a sign-up can be traced to an order. */
  quoteNumber: string;
  /** Set once and never cleared by an opt-in. See the header. */
  unsubscribedAt?: string;
  /** Somebody who unsubscribed has opted in again. The shop decides. */
  resubscribeAttemptedAt?: string;
  /** Last time any sign-up touched this record. */
  updatedAt: string;
};

export const SUBSCRIBER_PREFIX = "newsletter/subscribers/";

/** Trimmed and lowercased — the same address written two ways is one person. */
export function normaliseEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

/**
 * Where one subscriber's record lives.
 *
 * Hashed rather than the address itself: a pathname is metadata that shows
 * up in listings, logs and dashboards, and "the store contains
 * stacey@example.com" is the fact being protected. The hash is stable, so
 * the same person always lands on the same record.
 */
export function subscriberPath(email: string): string {
  const normalised = normaliseEmail(email);
  const digest = createHash("sha256").update(normalised).digest("hex");

  return `${SUBSCRIBER_PREFIX}${digest}.json`;
}

function parseRecord(raw: string | null): SubscriberRecord | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SubscriberRecord;
    return parsed && typeof parsed.email === "string" ? parsed : null;
  } catch {
    // A record we cannot read is not a record we may overwrite silently —
    // but it is also not a reason to fail somebody's order. Treated as
    // absent; the write below replaces it with something readable.
    return null;
  }
}

export async function readSubscriber(
  email: string,
  store: SubscriberStore
): Promise<SubscriberRecord | null> {
  return parseRecord(await store.read(subscriberPath(email)));
}

export type SubscriptionInput = {
  email: string;
  name?: string;
  company?: string;
  heardAbout?: string[];
  source: string;
  preChecked: boolean;
  quoteNumber: string;
  /** The server's timestamp for this write — never the browser's. */
  at: string;
  /**
   * When they actually agreed, when that is known from somewhere other than
   * this moment — an import of a list that already exists.
   *
   * Omitted means "now", which is right for a sign-up happening as we
   * watch. An EMPTY STRING means "we do not know", and is stored as such:
   * the temptation with an imported row is to stamp today so the record
   * looks complete, and that would be the app writing a consent record for
   * an agreement it did not witness — the one thing such a record must
   * never contain.
   */
  optedInAt?: string;
};

export type SubscriptionOutcome =
  | { stored: true; created: boolean; suppressed: false }
  /** They unsubscribed before. Recorded, not re-added. */
  | { stored: true; created: false; suppressed: true }
  | { stored: false; reason: string };

/**
 * Write one sign-up.
 *
 * Never throws: a newsletter sign-up must never affect a quote, which is the
 * rule lib/newsletter.ts has held since it was written.
 */
export async function recordSubscription(
  input: SubscriptionInput,
  store: SubscriberStore
): Promise<SubscriptionOutcome> {
  const email = normaliseEmail(input.email);

  if (!email || !email.includes("@")) {
    return { stored: false, reason: "No usable email address." };
  }

  try {
    const existing = await readSubscriber(email, store);

    if (existing?.unsubscribedAt) {
      // Sticky. See the header: a pre-ticked box must not undo somebody's
      // deliberate opt-out. The attempt is kept so the shop can see it.
      await store.put(
        subscriberPath(email),
        JSON.stringify(
          { ...existing, resubscribeAttemptedAt: input.at, updatedAt: input.at },
          null,
          2
        )
      );

      return { stored: true, created: false, suppressed: true };
    }

    const record: SubscriberRecord = {
      email,
      name: String(input.name || existing?.name || ""),
      company: String(input.company || existing?.company || ""),
      heardAbout: input.heardAbout?.length
        ? input.heardAbout
        : existing?.heardAbout ?? [],
      // The FIRST opt-in, kept. When they agreed is the fact a complaint is
      // answered with; a later order must not quietly restate it as today.
      optedInAt:
        existing?.optedInAt ||
        (input.optedInAt === undefined ? input.at : input.optedInAt),
      source: existing?.source || input.source,
      // Once false, always false: if they ever ticked it deliberately, that
      // is the stronger consent and it is the one worth keeping.
      preChecked: existing ? existing.preChecked && input.preChecked : input.preChecked,
      quoteNumber: existing?.quoteNumber || input.quoteNumber,
      updatedAt: input.at,
    };

    await store.put(subscriberPath(email), JSON.stringify(record, null, 2));

    return { stored: true, created: !existing, suppressed: false };
  } catch (error) {
    return {
      stored: false,
      reason: error instanceof Error ? error.message : "Unknown storage error.",
    };
  }
}

/**
 * Take somebody off the list.
 *
 * Writes a record even for an address the store has never seen. That is not
 * a mistake: an unsubscribe from somebody we cannot find still has to be
 * honoured if they ever arrive, and a tombstone is what makes the stickiness
 * above work for them too.
 */
export async function unsubscribeEmail(
  email: string,
  at: string,
  store: SubscriberStore
): Promise<{ ok: boolean; alreadyOff: boolean; reason?: string }> {
  const normalised = normaliseEmail(email);

  if (!normalised || !normalised.includes("@")) {
    return { ok: false, alreadyOff: false, reason: "No usable email address." };
  }

  try {
    const existing = await readSubscriber(normalised, store);

    if (existing?.unsubscribedAt) {
      // Idempotent. Somebody who clicks twice, or whose mail client fetches
      // the link and then they click it, must not see a failure.
      return { ok: true, alreadyOff: true };
    }

    const record: SubscriberRecord = {
      email: normalised,
      name: existing?.name ?? "",
      company: existing?.company ?? "",
      heardAbout: existing?.heardAbout ?? [],
      optedInAt: existing?.optedInAt ?? "",
      source: existing?.source ?? "unsubscribe (no prior record)",
      preChecked: existing?.preChecked ?? false,
      quoteNumber: existing?.quoteNumber ?? "",
      unsubscribedAt: at,
      updatedAt: at,
    };

    await store.put(subscriberPath(normalised), JSON.stringify(record, null, 2));

    return { ok: true, alreadyOff: false };
  } catch (error) {
    return {
      ok: false,
      alreadyOff: false,
      reason: error instanceof Error ? error.message : "Unknown storage error.",
    };
  }
}

/**
 * How many records the store holds.
 *
 * RECORDS, not subscribers — an unsubscribe is a record too, and telling
 * them apart means reading every file. The health page wants a sign of life
 * and a page load, not a headcount; the count that matters for a send is
 * computed when there is something to send.
 */
export async function countSubscriberRecords(
  store: SubscriberStore
): Promise<{ ok: boolean; records: number; reason?: string }> {
  try {
    let records = 0;
    let cursor: string | undefined;

    do {
      const page = await store.list(SUBSCRIBER_PREFIX, cursor);
      records += page.pathnames.length;
      cursor = page.cursor;
    } while (cursor);

    return { ok: true, records };
  } catch (error) {
    return {
      ok: false,
      records: 0,
      reason: error instanceof Error ? error.message : "Unknown storage error.",
    };
  }
}

/**
 * Every record, read.
 *
 * For the export and, later, for a send. Paginated because `list` is, and
 * read one page at a time rather than all at once: a serverless function
 * with a few thousand outstanding fetches is a function that gets killed.
 */
export async function readAllSubscribers(
  store: SubscriberStore
): Promise<SubscriberRecord[]> {
  const records: SubscriberRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await store.list(SUBSCRIBER_PREFIX, cursor);

    for (const pathname of page.pathnames) {
      const record = parseRecord(await store.read(pathname));
      if (record) records.push(record);
    }

    cursor = page.cursor;
  } while (cursor);

  return records;
}

/** Everybody a campaign may actually be sent to. */
export function mailable(records: SubscriberRecord[]): SubscriberRecord[] {
  return records.filter((record) => !record.unsubscribedAt && record.email);
}
