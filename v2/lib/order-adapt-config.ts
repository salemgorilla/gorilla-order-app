/**
 * THE ONE PLACE TO STEER HOW THE ORDER PAGE ADAPTS.
 *
 * Gabe, 2026-11-21: "Can we create some sort of rule that will make these
 * changes to the ordering process, adapting to how people use it and also
 * how they end up ordering?" — then "Build both" to (1) the app re-sorting
 * itself from what customers pick and order, with Black, Navy and Sport Grey
 * pinned on top, and (2) a weekly review that only ever SUGGESTS changes.
 *
 * Everything that decides part 1 is a number or a list in this file. Nothing
 * else in the app has its own copy of any of them.
 *
 * ── PINNED COLOURS ────────────────────────────────────────────────────────
 * Always first, in this order, on every garment, whatever the data says.
 * One line per pin. Each line lists the names that colour goes by across
 * S&S styles (the Bella+Canvas tee has no plain "Black", only "Solid Black
 * Blend"); the first name a garment actually has takes the pin. Delete a
 * line to unpin it, add a line to pin another. An empty list pins nothing
 * and lets the data order everything.
 */
export const PINNED_COLOR_SLOTS: readonly (readonly string[])[] = [
  ["Black", "Solid Black Blend", "Black Heather"],
  ["Navy", "Heather Navy", "Solid Navy Blend", "Heather Midnight Navy"],
  ["Sport Grey", "Athletic Heather", "Heather Grey", "Heather Gray"],
];

/**
 * The knobs. Each says what moving it does, in shop terms.
 */
export const ORDER_ADAPT = {
  /**
   * The master switch for re-sorting. False puts every garment back on the
   * hand-written order in lib/garment-color-ranking.ts at the next catalogue
   * load. Tracking carries on either way (USAGE_TRACKING=off in Vercel stops
   * that), so the data keeps building while sorting is off.
   */
  sortingEnabled: true,

  /**
   * How much one customer action counts.
   *
   * A colour in a SUBMITTED quote counts five times a colour somebody only
   * clicked. "What people actually order" is the thing being learned; clicks
   * are the early signal while orders are still few.
   */
  pickWeight: 1,
  orderWeight: 5,

  /**
   * No garment is re-sorted until it has this much weighted evidence: e.g.
   * 10 quotes, or 60 colour clicks, or any mix (clicks x1 + quotes x5).
   * Below it the garment keeps the hand-written order exactly, so three
   * early clicks on Neon Pink cannot put Neon Pink in the top twelve.
   */
  minEvidencePerGarment: 60,

  /**
   * How hard the hand-written order holds on. The ranked list is worth this
   * many points spread from the top slot down, so the data has to build up
   * well past the minimum before it can move a well-ranked colour much. The
   * bigger this is, the slower and smaller the changes.
   */
  priorStrength: 40,

  /**
   * Older activity fades: something done 30 days ago counts half, 60 days
   * a quarter. Lets the order follow the seasons (hoodie colours in October
   * are not hoodie colours in May) without one busy week taking over.
   */
  halfLifeDays: 30,

  /** Only this many days of history are read at all. */
  windowDays: 120,

  /**
   * How often the learned order is rebuilt. Once a day, so a customer never
   * sees the list reshuffle mid-visit, and Gabe sees at most one change a day.
   */
  rebuildEveryHours: 24,
} as const;
