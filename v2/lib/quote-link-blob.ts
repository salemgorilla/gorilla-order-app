import { del, get, list, put } from "@vercel/blob";

import type { BlobBackend } from "./quote-link-store";
import { quoteLinkStore } from "./quote-link-store";
import { readBlobCredential } from "./blob-health";

/**
 * The real blob backend. Kept apart from lib/quote-link-store.ts for the same
 * reason lib/subscriber-store.ts is: the SDK uses undici's fetch, so a test
 * that stubs globalThis.fetch does not intercept it and just hangs.
 *
 * PRIVATE blobs: these hold customer names, emails and IPs.
 */
export const vercelBlobBackend: BlobBackend = {
  async put(pathname, body) {
    await put(pathname, body, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
  },

  async read(pathname) {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;

    return await new Response(result.stream).text();
  },

  async list(prefix) {
    const names: string[] = [];
    let cursor: string | undefined;

    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      names.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    return names;
  },

  async del(pathname) {
    await del(pathname);
  },
};

export function isQuoteLinkStoreConfigured(): boolean {
  return readBlobCredential() !== "none";
}

export const liveQuoteLinkStore = () => quoteLinkStore(vercelBlobBackend);
