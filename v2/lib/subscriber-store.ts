/**
 * The real blob store behind lib/subscribers.ts.
 *
 * Kept apart from the logic on purpose. Everything in lib/subscribers.ts is
 * testable against a Map because it never imports this file — the Vercel SDK
 * issues its requests through undici's fetch rather than the global one, so
 * a test that stubs `globalThis.fetch` does not intercept it and simply
 * hangs. lib/blob-health.ts learned that the expensive way.
 */

import { get, list, put } from "@vercel/blob";

import { readBlobCredential } from "./blob-health";
import { googleDocTransport, readGoogleDocConfig } from "./google-docs-transport";
import { ledgerSubscriberStore } from "./subscriber-ledger";
import type { SubscriberStore } from "./subscribers";

/**
 * Whether there is anywhere to keep a list at all.
 *
 * ── IT ASKED THE WRONG QUESTION, AND THE LIST WAS SILENTLY EMPTY ─────────
 * This checked `BLOB_READ_WRITE_TOKEN` and nothing else. Production does not
 * authenticate that way: the store was moved to OIDC (VERCEL_OIDC_TOKEN +
 * BLOB_STORE_ID), which the SDK prefers and which every OTHER blob call in
 * the app already rides — artwork uploads included, which is why those work.
 *
 * So the SDK could write to the store perfectly well, and this function said
 * there was no store. The health check's 13 October run caught it, on two
 * orders a few minutes apart, both with `artwork=blob delivered=true` and
 * both with:
 *
 *   NEWSLETTER NOT SENT for GS-20261013-3OUQES6F: No subscriber store configured.
 *
 * The same blob store, working and "not configured" in one request.
 *
 * Three things hung off this one boolean and all three were dark: every
 * newsletter opt-in (the box was ticked, consent was recorded, nobody was
 * added), /api/unsubscribe, and the subscriber export. The shop email said
 * so honestly on every order — "Opted in — NOT added to any list" — which is
 * also what makes the gap recoverable: consent was recorded on each of those
 * orders, so the list can be backfilled from them.
 *
 * readBlobCredential is the one place that already knows how the SDK will
 * authenticate, including the case where the OIDC token arrives per request
 * and the env var is empty. Asking it, rather than keeping a second opinion
 * here, is the whole fix.
 */
export function isSubscriberStoreConfigured(): boolean {
  // A Google Doc that is set up WRONG still counts as configured: the attempt
  // must be made so the reason lands in the shop email. Reporting it as "not
  // configured" would hide a mistyped variable behind a generic message.
  if (readGoogleDocConfig().state !== "off") return true;

  return readBlobCredential() !== "none";
}

/**
 * Where the list is actually kept, for the places that say so out loud.
 *
 * "google-doc" wins whenever it is configured at all, and nothing is written
 * to both. Two stores would mean two answers to "is this person on the
 * list", which is the question this whole module exists to answer once.
 */
export function subscriberStoreKind(): "google-doc" | "blob" | "none" {
  if (readGoogleDocConfig().state !== "off") return "google-doc";

  return readBlobCredential() !== "none" ? "blob" : "none";
}

/**
 * THE store: the Google Doc when it is set up, the blob store otherwise.
 *
 * Every caller asks here rather than choosing. The Doc exists because the
 * blob store could not hold the list privately (it is a public store, and the
 * list is written as private blobs); until it is configured, behaviour is
 * exactly what it was.
 *
 * A half-configured Doc returns a store whose every call throws the reason.
 * That is deliberate: it is caught where all storage errors are caught, and
 * the reason reaches the shop email instead of a quiet fallback to a store
 * known not to work.
 */
export function subscriberStore(): SubscriberStore {
  const config = readGoogleDocConfig();

  if (config.state === "off") return vercelSubscriberStore();

  if (config.state === "broken") {
    const fail = async (): Promise<never> => {
      throw new Error(config.reason);
    };

    return { put: fail, read: fail, list: fail };
  }

  return ledgerSubscriberStore(googleDocTransport(config));
}

export function vercelSubscriberStore(): SubscriberStore {
  return {
    async put(pathname, body) {
      await put(pathname, body, {
        // PRIVATE. A public blob URL is unguessable, but what is stored here
        // is a list of customers' email addresses and unguessable is not the
        // same as private — the difference is one leaked pathname.
        access: "private",
        contentType: "application/json",
        // The pathname IS the identity (a hash of the address), so a random
        // suffix would turn every re-subscribe into a second record and make
        // the address unfindable.
        addRandomSuffix: false,
        // Overwriting one person's record with their own newer one is the
        // normal case here, not an error.
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      });
    },

    async read(pathname) {
      const result = await get(pathname, { access: "private", useCache: false });

      // Absent is a normal answer — most addresses that reach an unsubscribe
      // link have never been on the list.
      if (!result || result.statusCode !== 200) return null;

      return await new Response(result.stream).text();
    },

    async list(prefix, cursor) {
      const page = await list({ prefix, cursor, limit: 1000 });

      return {
        pathnames: page.blobs.map((blob) => blob.pathname),
        cursor: page.hasMore ? page.cursor : undefined,
      };
    },
  };
}
