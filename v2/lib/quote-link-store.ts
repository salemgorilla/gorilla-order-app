import { createHash } from "node:crypto";

import { createQuoteToken, isValidQuoteToken, type QuoteLink } from "./quote-link";

/**
 * Where quote links live: one JSON blob per link, one pointer per token, and
 * an append-only event log. No database - this app has none, and at this
 * volume a blob per record is what handoff, dropoff and subscribers already do.
 *
 *   quote-links/by-id/<id>.json            the link
 *   quote-links/by-token/<sha256>.json     { id, version } or { revoked: true }
 *   quote-links/events/<id>/<ts>-<rand>.json
 *
 * The token is stored only as a hash, so a leaked blob listing cannot be
 * turned back into working customer URLs.
 *
 * KNOWN LIMIT: read-modify-write on one blob is last-writer-wins. Two
 * simultaneous edits to one quote (customer double-click, shop and customer
 * at once) can lose one. Size edits are idempotent full replacements and
 * approval re-checks status, which is why this is tolerable here; it is not a
 * ledger and must not become one.
 */

export type BlobBackend = {
  put(pathname: string, body: string): Promise<void>;
  read(pathname: string): Promise<string | null>;
  list(prefix: string): Promise<string[]>;
  del(pathname: string): Promise<void>;
};

export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const linkPath = (id: string) => `quote-links/by-id/${id}.json`;
const tokenPath = (token: string) => `quote-links/by-token/${tokenHash(token)}.json`;

export type QuoteEvent = {
  orderId: string;
  event:
    | "link_created"
    | "link_regenerated"
    | "viewed"
    | "size_changed"
    | "approved"
    | "unlocked"
    | "payment_started"
    | "payment_failed"
    | "payment_mismatch"
    | "paid"
    | "printavo_created"
    | "printavo_failed";
  payload?: Record<string, unknown>;
  createdAt: string;
};

export function quoteLinkStore(backend: BlobBackend) {
  async function readJson<T>(path: string): Promise<T | null> {
    const text = await backend.read(path);
    if (!text) return null;

    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  async function logEvent(
    orderId: string,
    event: QuoteEvent["event"],
    payload?: Record<string, unknown>
  ) {
    const createdAt = new Date().toISOString();
    const rand = Math.random().toString(36).slice(2, 8);
    const record: QuoteEvent = { orderId, event, payload, createdAt };

    await backend.put(
      `quote-links/events/${orderId}/${createdAt}-${rand}.json`,
      JSON.stringify(record)
    );
  }

  return {
    logEvent,

    async getById(id: string): Promise<QuoteLink | null> {
      if (!/^[a-z0-9]{8,40}$/.test(id)) return null;
      return readJson<QuoteLink>(linkPath(id));
    },

    /** Token to link, or null if unknown, revoked, or expired. */
    async getByToken(token: string, now = Date.now()): Promise<QuoteLink | null> {
      if (!isValidQuoteToken(token)) return null;

      const pointer = await readJson<{ id?: string; version?: number; revoked?: boolean }>(
        tokenPath(token)
      );
      if (!pointer?.id || pointer.revoked) return null;

      const link = await readJson<QuoteLink>(linkPath(pointer.id));
      // A regenerate bumps the version, so a stale pointer that survived a
      // failed delete still cannot open the link.
      if (!link || link.tokenVersion !== pointer.version) return null;
      if (link.expiresAt && Date.parse(link.expiresAt) <= now) return null;

      return link;
    },

    async save(link: QuoteLink): Promise<void> {
      await backend.put(linkPath(link.id), JSON.stringify(link));
    },

    /** Mint a token for a link, replacing (revoking) the previous one. */
    async issueToken(link: QuoteLink, previousToken?: string): Promise<string> {
      const token = createQuoteToken();
      const next: QuoteLink = { ...link, tokenVersion: link.tokenVersion + 1 };

      // Save the link first: the pointer must never name a version the link
      // does not yet carry.
      await backend.put(linkPath(next.id), JSON.stringify(next));
      await backend.put(
        tokenPath(token),
        JSON.stringify({ id: next.id, version: next.tokenVersion })
      );

      if (previousToken) await backend.del(tokenPath(previousToken)).catch(() => {});

      return token;
    },

    async events(orderId: string): Promise<QuoteEvent[]> {
      const paths = await backend.list(`quote-links/events/${orderId}/`);
      const out: QuoteEvent[] = [];

      for (const path of paths.sort()) {
        const record = await readJson<QuoteEvent>(path);
        if (record) out.push(record);
      }

      return out;
    },

    /** Newest first, for the shop's list. */
    async listLinks(): Promise<QuoteLink[]> {
      const paths = await backend.list("quote-links/by-id/");
      const links: QuoteLink[] = [];

      for (const path of paths) {
        const link = await readJson<QuoteLink>(path);
        if (link) links.push(link);
      }

      return links.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

export type QuoteLinkStore = ReturnType<typeof quoteLinkStore>;
