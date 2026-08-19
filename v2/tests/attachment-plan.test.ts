import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  collectKnockoutCandidates,
  getDesignNumbers,
  planInlineArtwork,
  planKnockouts,
  planProofs,
  type Candidate,
} from "../lib/attachment-plan";
import {
  BODY_RESERVED_FOR_FIELDS_BYTES,
  MAX_INLINE_ARTWORK_TOTAL_BYTES,
  PLATFORM_BODY_LIMIT_BYTES,
} from "../lib/upload-limits";

/**
 * Who rides in the request body, and who gets left behind.
 *
 * The stake is not a missing picture. Going over the platform limit kills the
 * whole request at Vercel's edge with a 413 the route never sees — so a
 * mistake here loses the ORDER. It used to reach the customer as "Please try
 * again in a moment", advice that could never work, because the same file
 * failed identically every time.
 */

const MB = 1024 * 1024;

function file(id: string, megabytes: number): Candidate {
  return { id, name: `${id}.png`, size: Math.round(megabytes * MB) };
}

describe("the customer's own artwork claims the budget first", () => {
  test("everything fits when the cart is small", () => {
    const plan = planInlineArtwork([file("d1", 0.5), file("d2", 0.5)]);

    assert.deepEqual(plan.attached.map((c) => c.id), ["d1", "d2"]);
    assert.deepEqual(plan.dropped, []);
  });

  test("three files that each pass alone can still not fit together", () => {
    /**
     * The exact case a cart introduced. With one design, per-file and
     * per-request were the same number and nothing had to add anything up.
     * Three 2 MB files each pass the per-file check and together blow the
     * limit — which kills the request, not just an attachment.
     */
    const plan = planInlineArtwork([file("d1", 2), file("d2", 2), file("d3", 2)]);

    assert.ok(plan.bytesUsed <= MAX_INLINE_ARTWORK_TOTAL_BYTES);
    assert.equal(plan.attached.length + plan.dropped.length, 3);
  });

  test("one oversized design does not bury the smaller ones behind it", () => {
    // continue, not break. A 10 MB design 1 is hopeless; design 2 is fine.
    const plan = planInlineArtwork([file("huge", 10), file("small", 0.2)]);

    assert.deepEqual(plan.attached.map((c) => c.id), ["small"]);
    assert.deepEqual(plan.dropped.map((c) => c.id), ["huge"]);
  });

  test("a dropped file is named, so the shop knows what to chase", () => {
    const plan = planInlineArtwork([file("d1", 10)]);

    assert.equal(plan.dropped[0].name, "d1.png");
    assert.equal(plan.dropped[0].id, "d1");
    assert.ok(plan.dropped[0].size > 0);
  });

  test("an empty cart spends nothing", () => {
    assert.deepEqual(planInlineArtwork([]), {
      attached: [],
      dropped: [],
      bytesUsed: 0,
    });
  });

  test("nothing the planner attaches can exceed the pool", () => {
    // Property check over a spread of awkward carts, since the arithmetic is
    // what actually has to hold — not any one example.
    const carts: Candidate[][] = [
      [file("a", 3.4), file("b", 0.2)],
      [file("a", 1.75), file("b", 1.75), file("c", 1.75)],
      [file("a", 0.1), file("b", 3.5), file("c", 0.1)],
      [file("a", 3.5)],
      Array.from({ length: 20 }, (_, i) => file(`d${i}`, 0.3)),
    ];

    for (const cart of carts) {
      const plan = planInlineArtwork(cart);
      const total = plan.attached.reduce((sum, c) => sum + c.size, 0);

      assert.equal(total, plan.bytesUsed);
      assert.ok(
        plan.bytesUsed <= MAX_INLINE_ARTWORK_TOTAL_BYTES,
        `cart of ${cart.length} spent ${plan.bytesUsed} over the pool`
      );
      assert.equal(plan.attached.length + plan.dropped.length, cart.length);
    }
  });
});

describe("knockouts yield to the originals", () => {
  test("a knockout never takes budget an original would have used", () => {
    /**
     * The ordering IS the safety property. Every original is decided before
     * any knockout is considered, so a regenerable knockout cannot displace
     * the one file that cannot be regenerated.
     */
    const artwork = planInlineArtwork([file("d1", 3.0), file("d2", 0.4)]);
    assert.deepEqual(artwork.attached.map((c) => c.id), ["d1", "d2"]);

    const knockouts = planKnockouts([file("d1-ko", 0.5)], artwork.bytesUsed);

    // 3.4 used, 0.5 more would be 3.9 — over the pool, so it yields.
    assert.deepEqual(knockouts.attached, []);
    assert.deepEqual(knockouts.dropped.map((c) => c.id), ["d1-ko"]);
    assert.equal(knockouts.bytesUsed, artwork.bytesUsed);
  });

  test("a knockout rides along when there is genuinely room", () => {
    const knockouts = planKnockouts([file("d1-ko", 0.2)], 1 * MB);

    assert.deepEqual(knockouts.attached.map((c) => c.id), ["d1-ko"]);
    assert.ok(knockouts.bytesUsed > 1 * MB);
  });

  test("a full artwork budget leaves no room for any knockout", () => {
    const knockouts = planKnockouts(
      [file("a", 0.01), file("b", 0.01)],
      MAX_INLINE_ARTWORK_TOTAL_BYTES
    );

    assert.deepEqual(knockouts.attached, []);
    assert.equal(knockouts.dropped.length, 2);
  });
});

describe("proofs take only what is genuinely left", () => {
  test("artwork and knockouts together never push the body over the limit", () => {
    /**
     * The claim the whole file exists to protect, stated as arithmetic:
     * everything that can ride in the body, plus the reserve kept clear for
     * the order JSON and the analysis, stays under what the platform accepts.
     */
    const artwork = planInlineArtwork([file("d1", 2), file("d2", 1.4)]);
    const knockouts = planKnockouts([file("d1-ko", 0.1)], artwork.bytesUsed);
    const proofs = planProofs(
      [file("p1", 0.3), file("p2", 0.3), file("p3", 0.3)],
      knockouts.bytesUsed
    );

    assert.ok(
      proofs.bytesUsed + BODY_RESERVED_FOR_FIELDS_BYTES <=
        PLATFORM_BODY_LIMIT_BYTES,
      `body would be ${proofs.bytesUsed} + reserve, over the platform limit`
    );
  });

  test("a spent artwork budget still leaves proofs a little room", () => {
    // Artwork is capped at 3.5 MB but the body can spend 4.1 MB, so a full
    // artwork budget does not mean zero proofs.
    const proofs = planProofs(
      [file("p1", 0.2)],
      MAX_INLINE_ARTWORK_TOTAL_BYTES
    );

    assert.deepEqual(proofs.attached.map((c) => c.id), ["p1"]);
  });

  test("proofs that do not fit are reported, not silently missing", () => {
    // "Our proof" in the shop email must never imply every design got one.
    const proofs = planProofs(
      [file("p1", 0.4), file("p2", 0.4), file("p3", 0.4)],
      MAX_INLINE_ARTWORK_TOTAL_BYTES
    );

    assert.ok(proofs.dropped.length > 0);
    assert.equal(proofs.attached.length + proofs.dropped.length, 3);
  });

  test("no proof is attached when the body is already spent", () => {
    const proofs = planProofs([file("p1", 0.1)], PLATFORM_BODY_LIMIT_BYTES);

    assert.deepEqual(proofs.attached, []);
    assert.deepEqual(proofs.dropped.map((c) => c.id), ["p1"]);
  });

  test("the whole pipeline stays under the limit for a hostile cart", () => {
    // Five big designs, five knockouts, five proofs — the worst a customer
    // can hand us short of the blob path taking over.
    const artwork = planInlineArtwork(
      Array.from({ length: 5 }, (_, i) => file(`d${i}`, 3))
    );
    const knockouts = planKnockouts(
      Array.from({ length: 5 }, (_, i) => file(`k${i}`, 3)),
      artwork.bytesUsed
    );
    const proofs = planProofs(
      Array.from({ length: 5 }, (_, i) => file(`p${i}`, 3)),
      knockouts.bytesUsed
    );

    assert.ok(
      proofs.bytesUsed + BODY_RESERVED_FOR_FIELDS_BYTES <=
        PLATFORM_BODY_LIMIT_BYTES,
      "a hostile cart got the request body over the platform limit"
    );
  });
});

describe("only the sticker flow sends knockouts", () => {
  /**
   * order.items always holds at least one sticker item — defaultOrder is built
   * that way — in EVERY flow, including signs and apparel, which have no cart
   * and keep their file in the order-level slot. Switching product clears
   * neither the items nor the knockouts; only starting a new quote does.
   *
   * So this sequence sent the shop the wrong file: upload a sticker, run
   * background removal, switch to Banners & Signs, submit. The signs quote
   * carried a knocked-out sticker from the abandoned design, next to the
   * banner artwork, with nothing saying which was which.
   *
   * The artwork loop was gated on the sticker flow. So was the proof loop.
   * The knockout loop, doing the same job on the same data, was not.
   */
  const STICKER_ITEMS = ["d1", "d2"];
  const KNOCKOUTS = {
    d1: { name: "d1-knockout.png", size: 200_000 },
    d2: { name: "d2-knockout.png", size: 200_000 },
  };

  test("a signs order sends none, even with knockouts left over", () => {
    assert.deepEqual(
      collectKnockoutCandidates(false, STICKER_ITEMS, KNOCKOUTS),
      []
    );
  });

  test("an apparel order sends none either", () => {
    // Same guard, same reason — apparel has no cart.
    assert.deepEqual(
      collectKnockoutCandidates(false, ["d1"], { d1: KNOCKOUTS.d1 }),
      []
    );
  });

  test("a sticker order still sends every knockout it has", () => {
    // The guard must not cost the flow the feature actually belongs to.
    const candidates = collectKnockoutCandidates(
      true,
      STICKER_ITEMS,
      KNOCKOUTS
    );

    assert.deepEqual(candidates.map((c) => c.id), ["d1", "d2"]);
    assert.equal(candidates[0].name, "d1-knockout.png");
  });

  test("a design with no knockout is skipped, not sent empty", () => {
    const candidates = collectKnockoutCandidates(true, ["d1", "d2", "d3"], {
      d2: KNOCKOUTS.d2,
    });

    assert.deepEqual(candidates.map((c) => c.id), ["d2"]);
  });

  test("a stale knockout for a removed design is never sent", () => {
    // Removing a design drops its knockout, but the map is keyed by id and
    // the cart is the authority on which ids still exist.
    const candidates = collectKnockoutCandidates(true, ["d2"], KNOCKOUTS);

    assert.deepEqual(candidates.map((c) => c.id), ["d2"]);
  });

  test("candidates follow cart order, so ids line up with designs", () => {
    // Parts are keyed by design id and the shop reads them in cart order;
    // a reordered list would label design 2's file as design 1's.
    const candidates = collectKnockoutCandidates(
      true,
      ["d2", "d1"],
      KNOCKOUTS
    );

    assert.deepEqual(candidates.map((c) => c.id), ["d2", "d1"]);
  });
});

describe("a file is labelled with its design's number, not its own", () => {
  /**
   * ── THIS ALREADY HAPPENED, AND IT COSTS A REPRINT ─────────────────────────
   * Only designs that actually sent a file reach the upload loop. Numbering by
   * that loop's index numbers the FILES: on an order whose middle design has
   * no artwork, design 3's file was labelled "Design 2" and attached as
   * design-2-<name>.png, so the shop's file-to-design map pointed design 3's
   * art at design 2.
   *
   * The fix has been correct in the route for a while. What it lacked was
   * anything able to check it — the rule sat inside a handler needing a
   * Request, multipart parts and a blob store to run at all.
   * ──────────────────────────────────────────────────────────────────────────
   */
  test("numbers follow cart position", () => {
    const numbers = getDesignNumbers(["a", "b", "c"]);

    assert.equal(numbers.get("a"), 1);
    assert.equal(numbers.get("b"), 2);
    assert.equal(numbers.get("c"), 3);
  });

  test("a design with no artwork does not renumber the ones after it", () => {
    // THE DEFECT, as a number. Design "b" sent no file, so only "a" and "c"
    // reach the upload loop — and "c" is design THREE, not design two.
    const numbers = getDesignNumbers(["a", "b", "c"]);
    const partsWithFiles = ["a", "c"];

    assert.deepEqual(
      partsWithFiles.map((id) => numbers.get(id)),
      [1, 3],
      "counting the files instead of the cart labels design 3's art as design 2"
    );
  });

  test("a part the cart does not know about has no number", () => {
    // The caller falls back to the loop index for this, which is the best it
    // can do — but it must be reached only when the cart genuinely has no
    // entry, never as the ordinary path.
    assert.equal(getDesignNumbers(["a"]).get("ghost"), undefined);
  });

  test("an empty cart numbers nothing", () => {
    assert.equal(getDesignNumbers([]).size, 0);
  });

  test("the single-file flows still get design 1", () => {
    // Signs and apparel keep their file in the order-level slot, id "order".
    assert.equal(getDesignNumbers(["order"]).get("order"), 1);
  });
});
