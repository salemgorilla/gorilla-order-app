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

import type { SubscriberStore } from "./subscribers";

/** Whether there is anywhere to keep a list at all. */
export function isSubscriberStoreConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
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
