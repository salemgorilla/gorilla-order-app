/**
 * THE LIST, KEPT AS READABLE LINES IN A GOOGLE DOC.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * Gabe, 2026-10-20: "Store sign ups in a Google doc."
 *
 * The blob store this list was written to turned out to be public, and the
 * list is written as private blobs, so every sign-up since 14 October failed
 * with `Failed to fetch blob: 400 Bad Request` (see lib/subscribers.ts for
 * the original design and HANDOFF.md for the diagnosis). A public blob for a
 * customer's email address was the one option the design was written to
 * refuse. A Google Doc in the shop's own Google account is private by
 * default, can be read by a person without a tool, and sits next to the Gmail
 * account that already holds the same opt-in in every shop email.
 *
 * ── A DOC IS NOT A DATABASE, SO IT IS KEPT AS A LEDGER ────────────────────
 * Documents have no records to update. So nothing is ever updated: a change
 * to a person appends one more line, and the LAST line for an address is the
 * one that counts. The history stays visible, which for a consent record is a
 * feature: a person who unsubscribed and later ticked the box again shows
 * both facts, in order.
 *
 * Each line is human-readable, because the point of a Doc is that somebody
 * opens it. It is also exactly parseable, because the app reads it back to
 * enforce the one rule that matters (below). Twelve fields, separated by
 * " | ", in a fixed order:
 *
 *   status | email | name | company | heard about us | first opted in |
 *   box pre-ticked | order | source | unsubscribed at | asked to rejoin at |
 *   last updated
 *
 * ── THE STICKY UNSUBSCRIBE SURVIVES, UNCHANGED ────────────────────────────
 * This file does not decide anything about consent. lib/subscribers.ts still
 * reads a record, applies the rule that an ordinary opt-in never clears
 * `unsubscribedAt`, and writes a record back. This is only the shelf it
 * writes to, behind the same three-method SubscriberStore interface the blob
 * store implements. tests/subscriber-ledger.test.ts drives the real consent
 * functions against it to prove that.
 *
 * ── WHAT IT COSTS ─────────────────────────────────────────────────────────
 * Reading the list means reading the whole Doc, once per store instance
 * (every request makes its own), then answering from memory. That is fine for
 * a shop's list and gets slower as the Doc grows: Google returns the whole
 * document structure, which is far larger than the text. A few thousand
 * lines is comfortable; if it ever is not, start a new Doc and point
 * SUBSCRIBER_DOC_ID at it.
 */

import {
  normaliseEmail,
  subscriberPath,
  type SubscriberRecord,
  type SubscriberStore,
} from "./subscribers";

/**
 * What the ledger needs from wherever the text lives. Two operations, so the
 * whole format can be driven against a string in a test — the Google client
 * (lib/google-docs-transport.ts) is a thin shell around exactly these.
 */
export type LedgerTransport = {
  /** The document's text, one line per paragraph. */
  readText(): Promise<string>;
  /** Add one line at the end. The transport supplies the line break. */
  append(line: string): Promise<void>;
};

const SEP = " | ";
const BLANK = "-";
const FIELD_COUNT = 12;

/** Stands in for the date when a line was marked unsubscribed by editing the Doc. */
export const MARKED_BY_HAND = "marked by hand in the Doc";

/**
 * Finds a ledger line even if something is stuck to the front of it.
 *
 * The leftmost match wins, so "UNSUBSCRIBED | " is found at its first letter
 * and never as the SUBSCRIBED at its own tail; the order of the two
 * alternatives is immaterial. (An earlier comment here said otherwise, and a
 * mutation that swapped them changed nothing, which is how it was caught.)
 * Deliberately tolerant about what comes before: if the first line a
 * transport writes ever shares a paragraph with the document's heading, the
 * sign-up must still be read, not dropped.
 */
const STATUS = /(UNSUBSCRIBED|SUBSCRIBED) \| /;

/**
 * One field, made safe to sit between separators.
 *
 * A pipe becomes a slash and line breaks become spaces, so a name like
 * "Acme | Sons" can never be read as two fields. Lossy for those characters
 * only, and the comparison that decides whether to append works on the
 * cleaned text too, so the loss cannot cause a line to be written twice.
 */
function clean(value: unknown): string {
  const text = String(value ?? "")
    .replace(/[\r\n\t\u2028\u2029]+/g, " ")
    .replace(/\s*\|\s*/g, " / ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text || BLANK;
}

function unclean(value: string): string {
  return value === BLANK ? "" : value;
}

function fields(record: SubscriberRecord, includeUpdated: boolean): string[] {
  return [
    record.unsubscribedAt ? "UNSUBSCRIBED" : "SUBSCRIBED",
    clean(normaliseEmail(record.email)),
    clean(record.name),
    clean(record.company),
    clean((record.heardAbout || []).map((item) => String(item).replace(/;/g, ",")).join("; ")),
    clean(record.optedInAt),
    record.preChecked ? "yes" : "no",
    clean(record.quoteNumber),
    clean(record.source),
    clean(record.unsubscribedAt),
    clean(record.resubscribeAttemptedAt),
    includeUpdated ? clean(record.updatedAt) : BLANK,
  ];
}

/** One person's current state as one line of the Doc. */
export function formatLedgerLine(record: SubscriberRecord): string {
  return fields(record, true).join(SEP);
}

/**
 * Whether two states are the same apart from WHEN they were last touched.
 *
 * `recordSubscription` writes on every order, and a returning customer's
 * second order changes only `updatedAt`. Appending a line for that would
 * fill the Doc with noise nobody can act on, so a write that changes nothing
 * a person would care about is skipped.
 */
export function sameState(a: SubscriberRecord, b: SubscriberRecord): boolean {
  return fields(a, false).join(SEP) === fields(b, false).join(SEP);
}

/** One line back into a record, or null if it is not a ledger line. */
export function parseLedgerLine(line: string): SubscriberRecord | null {
  const found = STATUS.exec(line);
  if (!found) return null;

  const parts = line.slice(found.index).split(SEP);
  if (parts.length !== FIELD_COUNT) return null;

  const email = normaliseEmail(parts[1]);
  if (!email.includes("@")) return null;

  const heard = unclean(parts[4]);

  // The status word is a label for the person reading the Doc, and the app
  // normally writes it consistently with the unsubscribed-at column. But a
  // person may change SUBSCRIBED to UNSUBSCRIBED by hand to take somebody off
  // the list, and ignoring that would keep mailing them. For a consent
  // record, honouring the word is the only safe direction; the app cannot
  // know WHEN, so it says who decided.
  const unsubscribedAt =
    unclean(parts[9]) || (found[1] === "UNSUBSCRIBED" ? MARKED_BY_HAND : "");
  const rejoin = unclean(parts[10]);

  return {
    email,
    name: unclean(parts[2]),
    company: unclean(parts[3]),
    heardAbout: heard ? heard.split("; ") : [],
    optedInAt: unclean(parts[5]),
    preChecked: parts[6] === "yes",
    quoteNumber: unclean(parts[7]),
    source: unclean(parts[8]),
    ...(unsubscribedAt ? { unsubscribedAt } : {}),
    ...(rejoin ? { resubscribeAttemptedAt: rejoin } : {}),
    updatedAt: unclean(parts[11]),
  };
}

/**
 * The whole Doc to everyone's CURRENT state: the last line per address.
 *
 * Anything that is not a ledger line — the title, the explanation, a blank
 * paragraph — is skipped rather than rejected, because it is supposed to be
 * there.
 */
export function readLedger(text: string): Map<string, SubscriberRecord> {
  const current = new Map<string, SubscriberRecord>();

  for (const line of String(text || "").split(/\r?\n/)) {
    const record = parseLedgerLine(line);
    if (record) current.set(record.email, record);
  }

  return current;
}

/**
 * A SubscriberStore backed by the ledger.
 *
 * The three methods are the same three the blob store offers, keyed by the
 * same hashed pathname, so lib/subscribers.ts cannot tell the difference.
 *
 * The Doc is read once, lazily, and then answered from memory; a write
 * updates that memory as well as appending. A store is made per request, so
 * the snapshot never outlives the request that took it — nothing here can
 * serve a stale answer to a later one.
 */
export function ledgerSubscriberStore(transport: LedgerTransport): SubscriberStore {
  let snapshot: Map<string, SubscriberRecord> | null = null;

  async function load(): Promise<Map<string, SubscriberRecord>> {
    if (!snapshot) {
      const byEmail = readLedger(await transport.readText());
      snapshot = new Map(
        [...byEmail.values()].map((record) => [subscriberPath(record.email), record])
      );
    }

    return snapshot;
  }

  return {
    async put(pathname, body) {
      let record: SubscriberRecord;

      try {
        record = JSON.parse(body) as SubscriberRecord;
      } catch {
        throw new Error("Subscriber record was not valid JSON.");
      }

      if (!record || typeof record.email !== "string" || !record.email.includes("@")) {
        throw new Error("Subscriber record has no usable email address.");
      }

      // The pathname is a hash of the address. If they disagree, the caller is
      // about to file one person's state under another's name.
      if (pathname !== subscriberPath(record.email)) {
        throw new Error("Subscriber path does not match the record's email.");
      }

      const entries = await load();
      const existing = entries.get(pathname);

      if (existing && sameState(existing, record)) return;

      await transport.append(formatLedgerLine(record));
      entries.set(pathname, record);
    },

    async read(pathname) {
      const record = (await load()).get(pathname);
      return record ? JSON.stringify(record) : null;
    },

    async list(prefix) {
      const paths = [...(await load()).keys()].filter((path) => path.startsWith(prefix));

      // One page. The whole list is already in memory, and a cursor that
      // pretends otherwise would only add a way to get it wrong.
      return { pathnames: paths };
    },
  };
}

