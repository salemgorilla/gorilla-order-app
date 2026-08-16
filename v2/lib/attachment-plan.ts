import {
  MAX_INLINE_ARTWORK_TOTAL_BYTES,
  isArtworkTooLargeToAttach,
  remainingInlineBudget,
} from "./upload-limits";

/**
 * Who gets to ride in the request body, and who gets left behind.
 *
 * ── WHY THIS IS ITS OWN FILE ──────────────────────────────────────────────
 * lib/upload-limits.ts holds the NUMBERS. This holds the POLICY that spends
 * them — which lived inside the submit handler in app/page.tsx, where nothing
 * could test it. The numbers were reviewable by reading; the spending was not.
 *
 * The stake is higher than it looks. Going over the platform body limit does
 * not lose a picture, it kills the whole request at Vercel's edge with a 413
 * the route never sees — so a mistake here loses the ORDER, not an attachment.
 * That failure used to surface to the customer as "Please try again in a
 * moment", advice that could never work, because the same file failed
 * identically every time.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Sizes only. Nothing here touches a File, a FormData or the network, which is
 * what makes the policy checkable without a browser.
 */
export type Candidate = {
  /** Design id, or "order" for the single-file signs and apparel flows. */
  id: string;
  name: string;
  size: number;
};

export type InlinePlan = {
  attached: Candidate[];
  dropped: Candidate[];
  /** Body bytes claimed so far. Feeds the next stage's budget. */
  bytesUsed: number;
};

/**
 * The knockouts this submission is actually entitled to send.
 *
 * ── THE BUG THIS FUNCTION EXISTS TO PREVENT ───────────────────────────────
 * `order.items` always holds at least one sticker item — defaultOrder is
 * built that way — in EVERY flow, including signs and apparel, which do not
 * use the cart at all and keep their file in the order-level slot. Switching
 * product does not clear it, and does not clear itemKnockouts either; only
 * starting a new quote does.
 *
 * So a customer who uploaded a sticker, ran background removal, then switched
 * to Banners & Signs and submitted, sent the shop a knocked-out file from the
 * sticker design they had abandoned — attached to a signs quote, alongside the
 * banner artwork, with nothing saying which was which.
 *
 * The artwork loop was gated on the sticker flow. The proof loop was gated on
 * the sticker flow. The knockout loop, doing the same job on the same data,
 * was not — the third sibling missing the guard the other two had.
 * ──────────────────────────────────────────────────────────────────────────
 */
export function collectKnockoutCandidates(
  isStickerFlow: boolean,
  itemIds: string[],
  knockoutsById: Record<string, { name: string; size: number } | undefined>
): Candidate[] {
  // Knockouts are a cart feature. Signs and apparel have no cart, so anything
  // sitting in this map belongs to a design they are not ordering.
  if (!isStickerFlow) return [];

  const candidates: Candidate[] = [];

  for (const id of itemIds) {
    const knockout = knockoutsById[id];
    if (!knockout) continue;

    candidates.push({ id, name: knockout.name, size: knockout.size });
  }

  return candidates;
}

/**
 * The customer's own artwork — the one thing here that cannot be regenerated,
 * so it claims the budget first.
 *
 * DROP POLICY: files are taken in cart order until the budget is spent, and
 * anything that does not fit is left behind and reported by design and
 * filename so the shop knows exactly what to ask for. It is never a reason to
 * fail the submission.
 *
 * Deliberately `continue`, not `break`: one oversized design must not bury the
 * smaller ones behind it. A 4 MB design 1 is dropped and a 200 KB design 2
 * still travels.
 */
export function planInlineArtwork(candidates: Candidate[]): InlinePlan {
  const attached: Candidate[] = [];
  const dropped: Candidate[] = [];
  let bytesUsed = 0;

  for (const candidate of candidates) {
    // Two separate ceilings, and both matter. The per-file one catches a
    // single monster; the cumulative one catches three files that each pass
    // the per-file check and together blow the request body.
    const tooBigAlone = isArtworkTooLargeToAttach(candidate);
    const tooBigTogether =
      bytesUsed + candidate.size > MAX_INLINE_ARTWORK_TOTAL_BYTES;

    if (tooBigAlone || tooBigTogether) {
      dropped.push(candidate);
      continue;
    }

    attached.push(candidate);
    bytesUsed += candidate.size;
  }

  return { attached, dropped, bytesUsed };
}

/**
 * The knocked-out artwork, alongside the original it was made from.
 *
 * Sent so prepress has the file the customer actually approved rather than
 * redoing the matting and hoping it lands in the same place. It is a HEAD
 * START, never the deliverable, which is why it runs AFTER the originals have
 * claimed what they need and shares their pool rather than getting its own.
 *
 * Ordering is the safety property: because every original is decided before
 * any knockout is considered, a regenerable knockout can never take budget an
 * irreplaceable original would have used.
 */
export function planKnockouts(
  candidates: Candidate[],
  bytesUsed: number
): InlinePlan {
  const attached: Candidate[] = [];
  const dropped: Candidate[] = [];
  let used = bytesUsed;

  for (const candidate of candidates) {
    if (used + candidate.size > MAX_INLINE_ARTWORK_TOTAL_BYTES) {
      dropped.push(candidate);
      continue;
    }

    attached.push(candidate);
    used += candidate.size;
  }

  return { attached, dropped, bytesUsed: used };
}

/**
 * The proofs we rendered, which take whatever the customer's own files left.
 *
 * A different ceiling from the two above on purpose: artwork and knockouts
 * share a 3.5 MB pool, while proofs are bounded by what is actually left of
 * the request body once the fields have had their reserve. One proof fit
 * beside a full artwork budget by luck; three would not.
 *
 * `break`, not `continue` — proofs are rendered in cart order at similar
 * sizes, so once one does not fit the rest almost certainly do not either,
 * and every attempt costs a canvas render.
 */
export function planProofs(
  candidates: Candidate[],
  bytesUsed: number
): InlinePlan {
  const budget = remainingInlineBudget(bytesUsed);
  const attached: Candidate[] = [];
  const dropped: Candidate[] = [];
  let spent = 0;

  for (const [index, candidate] of candidates.entries()) {
    if (spent + candidate.size > budget) {
      dropped.push(...candidates.slice(index));
      break;
    }

    attached.push(candidate);
    spent += candidate.size;
  }

  return { attached, dropped, bytesUsed: bytesUsed + spent };
}
