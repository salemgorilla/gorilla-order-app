/**
 * THE THEME CALENDAR — the one file to edit to change when the order app
 * changes its look, what colours it wears, and what decor it shows.
 *
 * Gabe, 2026-11-23: "Can we set up a schedule to change the theme for
 * seasons and holiday/special days?"
 *
 * ── HOW IT PICKS ─────────────────────────────────────────────────────────
 * Every visit, on the shop's clock (America/New_York, midnight in Salem):
 *   1. the first HOLIDAY below whose dates include today wins;
 *   2. otherwise the SEASON whose dates include today;
 *   3. otherwise (or if everything is switched off) the house Gorilla
 *      colours from app/globals.css.
 * Order matters only where two holidays overlap: the one higher in the
 * list wins.
 *
 * ── TO CHANGE A DATE ─────────────────────────────────────────────────────
 * Edit `from` / `to`. Both days are included. Four ways to write a day:
 *   "02-14"                 a fixed day, month-day
 *   "easter"                Easter Sunday (worked out for each year)
 *   "easter -6"             six days before Easter; "+1" is the day after
 *   "2nd sun of may"        1st..5th or last, sun..sat, of jan..dec
 *   "2nd sun of may -6"     six days before that
 * A range may cross New Year ("12-31" to "01-02").
 *
 * ── TO TURN ONE OFF ──────────────────────────────────────────────────────
 * Set `on: false`. It can still be previewed with ?theme=<id>.
 *
 * ── TO PREVIEW ───────────────────────────────────────────────────────────
 * Add ?theme=<id> to any page, e.g. labs.gorillasalem.com/?theme=halloween.
 * ?theme=default shows the plain house colours.
 *
 * ── TO ADD ONE ───────────────────────────────────────────────────────────
 * Copy an entry, give it a new lowercase `id`, dates and colours. Decor
 * names come from lib/theme-decor.ts. `npm test` checks every colour pair
 * for readability (WCAG AA) and every date for typos, so a mistake fails
 * the build rather than the shop's website.
 *
 * ── RULES THAT DO NOT BEND ───────────────────────────────────────────────
 * A theme only recolours and decorates. Rush red (late / error) and the
 * magenta cut line are never themed: they mean something on every screen.
 * Decor is small, sits behind or beside content, never takes a tap, and
 * holds still for visitors who ask for less motion.
 */

/** The inks a theme may recolour. Anything left out keeps the house ink. */
export type ThemeToken =
  | "ink-black"
  | "ink-muted"
  | "shirt-blank"
  | "rule"
  | "rule-faint"
  | "gorilla-green"
  | "gorilla-green-dark"
  | "green-bright"
  | "surface-ok"
  | "badge-fill";

export interface ThemeEntry {
  /** Lowercase, used in ?theme=<id>. */
  id: string;
  /** What to call it. */
  name: string;
  kind: "holiday" | "season";
  on: boolean;
  from: string;
  to: string;
  /**
   * gorilla-green is the accent (buttons, prices, links) and must carry
   * white type; badge-fill is the hoodie special's starburst.
   */
  colors: Partial<Record<ThemeToken, string>>;
  /** The thin stripe along the top of the header. */
  stripe?: { colors: string[]; angle: number; band: string };
  decor?: {
    /** Beside the GORILLA LABS wordmark. */
    header?: string;
    /** Tucked on the corner of the quote desk box and the hoodie badge. */
    corner?: string;
    /** Drifting behind the page. One to three shapes, taken in turn. */
    drift?: { shapes: string[]; count: number; direction: "down" | "up" };
    /**
     * An animated character that follows the mouse (lib/theme-cursors.ts):
     * santa, turkey, cupid, witch, cat, leprechaun, bunny, bouquet,
     * spatula, rocket or bottle. Mouse only; phones and tablets keep their
     * normal touch, and buttons, links, swatches and fields keep the
     * normal pointer.
     */
    cursor?: string;
  };
}

export const THEME_CALENDAR: readonly ThemeEntry[] = [
  /* ================= HOLIDAYS (win over seasons) ================= */
  {
    id: "new-year",
    name: "New Year's",
    kind: "holiday",
    on: true,
    from: "01-01",
    to: "01-03",
    colors: {
      "ink-muted": "#575464",
      "shirt-blank": "#f5f4f8",
      rule: "#85818f",
      "rule-faint": "#dcdae3",
      "gorilla-green": "#22305a", // midnight navy
      "gorilla-green-dark": "#141d3b",
      "green-bright": "#e2b94b", // champagne gold, on black only
      "surface-ok": "#e7e9f2",
      "badge-fill": "#22305a",
    },
    stripe: { colors: ["#22305a", "#e2b94b", "#f5f4f8", "#e2b94b"], angle: 90, band: "1rem" },
    decor: {
      cursor: "bottle",
      header: "sparkle",
      corner: "sparkle",
      drift: { shapes: ["confetti", "confetti-blue", "sparkle-small"], count: 12, direction: "down" },
    },
  },
  {
    id: "valentines",
    name: "Valentine's Day",
    kind: "holiday",
    on: true,
    from: "02-07",
    to: "02-14",
    colors: {
      "ink-black": "#1f1216",
      "ink-muted": "#5e4a51",
      "shirt-blank": "#fbf1f3", // blush
      rule: "#8f7880",
      "rule-faint": "#ecd9de",
      "gorilla-green": "#a81f4b", // raspberry
      "gorilla-green-dark": "#7d1536",
      "green-bright": "#f29bb8",
      "surface-ok": "#f8e3e9",
      "badge-fill": "#7d1536",
    },
    stripe: { colors: ["#a81f4b", "#fbf1f3", "#f29bb8", "#fbf1f3"], angle: -45, band: "0.75rem" },
    decor: {
      cursor: "cupid",
      header: "heart",
      corner: "hearts",
      drift: { shapes: ["heart", "heart-pink"], count: 10, direction: "up" },
    },
  },
  {
    id: "st-patricks",
    name: "St. Patrick's Day",
    kind: "holiday",
    on: true,
    from: "03-10",
    to: "03-17",
    colors: {
      "ink-muted": "#4f5a4f",
      "shirt-blank": "#eff6ec",
      rule: "#7c8a7b",
      "rule-faint": "#d5e3d1",
      "gorilla-green": "#16703a", // shamrock
      "gorilla-green-dark": "#0e5129",
      "green-bright": "#7fd796",
      "surface-ok": "#ddefdf",
      "badge-fill": "#8a5d00", // old gold
    },
    stripe: { colors: ["#16703a", "#eff6ec", "#d9a82b", "#eff6ec"], angle: 90, band: "1.5rem" },
    decor: {
      cursor: "leprechaun",
      header: "shamrock",
      corner: "shamrocks",
      drift: { shapes: ["shamrock", "shamrock-light"], count: 10, direction: "down" },
    },
  },
  {
    id: "easter",
    name: "Easter",
    kind: "holiday",
    on: true,
    from: "easter -6",
    to: "easter",
    colors: {
      "ink-muted": "#585166",
      "shirt-blank": "#f6f3fb", // lavender white
      rule: "#857d92",
      "rule-faint": "#e2dcec",
      "gorilla-green": "#5e3f94", // violet
      "gorilla-green-dark": "#432c6d",
      "green-bright": "#c9b3ee",
      "surface-ok": "#ece6f6",
      "badge-fill": "#2f6e5f", // spring teal
    },
    stripe: { colors: ["#c9b3ee", "#f6e7a1", "#a9dcc8", "#f5c2d3"], angle: 90, band: "1.5rem" },
    decor: {
      cursor: "bunny",
      header: "egg",
      corner: "eggs",
      drift: { shapes: ["blossom", "blossom-yellow"], count: 8, direction: "down" },
    },
  },
  {
    id: "mothers-day",
    name: "Mother's Day",
    kind: "holiday",
    on: true,
    from: "2nd sun of may -6",
    to: "2nd sun of may",
    colors: {
      "ink-muted": "#5d4d52",
      "shirt-blank": "#fbf3f2",
      rule: "#8e7b80",
      "rule-faint": "#ecdcdc",
      "gorilla-green": "#963a55", // rose
      "gorilla-green-dark": "#6f2a3f",
      "green-bright": "#f1a8bb",
      "surface-ok": "#f6e4e7",
      "badge-fill": "#4f6b2e", // leaf
    },
    stripe: { colors: ["#963a55", "#fbf3f2", "#f1a8bb", "#fbf3f2"], angle: 90, band: "1rem" },
    decor: {
      cursor: "bouquet",
      header: "tulip",
      corner: "tulip",
      drift: { shapes: ["blossom", "blossom-rose"], count: 8, direction: "down" },
    },
  },
  {
    id: "fathers-day",
    name: "Father's Day",
    kind: "holiday",
    on: true,
    from: "3rd sun of jun -6",
    to: "3rd sun of jun",
    colors: {
      "ink-muted": "#4f5560",
      "shirt-blank": "#f1f3f6",
      rule: "#7d8390",
      "rule-faint": "#d9dde5",
      "gorilla-green": "#284a72", // denim navy
      "gorilla-green-dark": "#1b3453",
      "green-bright": "#9cc2ec",
      "surface-ok": "#e2e8f1",
      "badge-fill": "#7a4a22", // saddle brown
    },
    stripe: { colors: ["#284a72", "#f1f3f6", "#7a4a22", "#f1f3f6"], angle: -45, band: "0.75rem" },
    decor: { header: "necktie", cursor: "spatula" },
  },
  {
    id: "july-4",
    name: "4th of July",
    kind: "holiday",
    on: true,
    from: "07-01",
    to: "07-05",
    colors: {
      "ink-black": "#0f1424",
      "ink-muted": "#50566a",
      "shirt-blank": "#f6f6f8",
      rule: "#7f8496",
      "rule-faint": "#dcdee6",
      "gorilla-green": "#1f3a6e", // old glory blue
      "gorilla-green-dark": "#13264b",
      "green-bright": "#8fb2f0",
      "surface-ok": "#e3e8f3",
      "badge-fill": "#b22234", // old glory red
    },
    stripe: { colors: ["#b22234", "#f6f6f8", "#1f3a6e", "#f6f6f8"], angle: 90, band: "1rem" },
    decor: {
      cursor: "rocket",
      header: "star-header",
      corner: "firework",
      drift: { shapes: ["star", "star-blue", "star-gold"], count: 10, direction: "down" },
    },
  },
  {
    // Salem's biggest month. All of October gets a spooky-season look; the
    // last week turns it up for Halloween itself.
    id: "october",
    name: "October in Salem",
    kind: "holiday",
    on: true,
    from: "10-01",
    to: "10-24",
    colors: {
      "ink-black": "#1a1320",
      "ink-muted": "#574d5e",
      "shirt-blank": "#f6f1f2",
      rule: "#857a89",
      "rule-faint": "#e3d9df",
      "gorilla-green": "#5a2c85", // witch purple
      "gorilla-green-dark": "#40205f",
      "green-bright": "#f08b2c", // pumpkin, on black only
      "surface-ok": "#ece4f1",
      "badge-fill": "#a6430a", // burnt orange
    },
    stripe: { colors: ["#5a2c85", "#f08b2c", "#1a1320", "#f08b2c"], angle: 90, band: "1.5rem" },
    decor: {
      cursor: "cat",
      header: "moon",
      corner: "pumpkin",
      drift: { shapes: ["leaf", "leaf-gold", "leaf-red"], count: 8, direction: "down" },
    },
  },
  {
    id: "halloween",
    name: "Halloween",
    kind: "holiday",
    on: true,
    from: "10-25",
    to: "10-31",
    colors: {
      "ink-black": "#140e17",
      "ink-muted": "#56495a",
      "shirt-blank": "#f7efe4", // old parchment
      rule: "#8a7866",
      "rule-faint": "#e5d6c4",
      "gorilla-green": "#a33b00", // jack-o'-lantern orange
      "gorilla-green-dark": "#772b00",
      "green-bright": "#ff9a3c",
      "surface-ok": "#f4e2d2",
      "badge-fill": "#140e17", // black cat
    },
    stripe: { colors: ["#140e17", "#ff9a3c"], angle: -45, band: "0.75rem" },
    decor: {
      cursor: "witch",
      header: "bat-header",
      corner: "jack-o-lantern",
      drift: { shapes: ["bat", "bat-purple"], count: 10, direction: "up" },
    },
  },
  {
    // PR 227's Thanksgiving inks, unchanged.
    id: "thanksgiving",
    name: "Thanksgiving",
    kind: "holiday",
    on: true,
    from: "11-01",
    to: "11-30",
    colors: {
      "ink-black": "#22160d", // warm near-black brown
      "ink-muted": "#5c4632", // walnut
      "shirt-blank": "#f8eedd", // cream
      rule: "#8f7660",
      "rule-faint": "#e3d3bb",
      "gorilla-green": "#9a4b00", // pumpkin
      "gorilla-green-dark": "#733700",
      "green-bright": "#e2a72e", // harvest gold
      "surface-ok": "#f6e6d2",
      "badge-fill": "#8a1f2d", // cranberry
    },
    stripe: { colors: ["#9a4b00", "#e2a72e", "#8a1f2d", "#5c4632"], angle: 90, band: "2rem" },
    decor: {
      cursor: "turkey",
      // Gabe, 2026-11-23: yes to "a small pumpkin or acorn by the logo".
      header: "pumpkin",
      corner: "leaf-corner",
      drift: { shapes: ["leaf", "leaf-gold", "leaf-red"], count: 8, direction: "down" },
    },
  },
  {
    // PR 227's Christmas, unchanged: evergreen, cranberry red and gold on
    // warm white, with bells, holly and light snow.
    id: "christmas",
    name: "Christmas",
    kind: "holiday",
    on: true,
    from: "12-01",
    to: "12-31",
    colors: {
      "ink-muted": "#5a5448",
      "shirt-blank": "#fbf7ef", // warm white
      rule: "#8a8270",
      "rule-faint": "#e4ddcd",
      "gorilla-green": "#1d5c34", // evergreen
      "gorilla-green-dark": "#123f22",
      "green-bright": "#d6ac3a", // gold
      "surface-ok": "#e6f0e7",
      "badge-fill": "#a11a2e", // cranberry red
    },
    stripe: { colors: ["#a11a2e", "#fbf7ef", "#1d5c34", "#fbf7ef"], angle: -45, band: "0.75rem" },
    decor: {
      cursor: "santa",
      header: "bells",
      corner: "holly",
      drift: { shapes: ["snowflake"], count: 12, direction: "down" },
    },
  },

  /* ============ SEASONS (between holidays; gentle on purpose) ============ */
  {
    id: "winter",
    name: "Winter",
    kind: "season",
    on: true,
    from: "12-21",
    to: "03-19",
    colors: {
      "ink-muted": "#525a60",
      "shirt-blank": "#f0f4f6", // frost
      rule: "#7e878d",
      "rule-faint": "#d7dfe3",
      "gorilla-green": "#21606a", // winter spruce
      "gorilla-green-dark": "#164349",
      "green-bright": "#8fcbd6",
      "surface-ok": "#e1edef",
      "badge-fill": "#2b4c7e",
    },
    stripe: { colors: ["#21606a", "#f0f4f6", "#8fcbd6", "#f0f4f6"], angle: 90, band: "1.5rem" },
    decor: { drift: { shapes: ["snowflake"], count: 6, direction: "down" } },
  },
  {
    id: "spring",
    name: "Spring",
    kind: "season",
    on: true,
    from: "03-20",
    to: "06-20",
    colors: {
      "ink-muted": "#55594c",
      "shirt-blank": "#f4f6ec", // new leaf
      rule: "#82877a",
      "rule-faint": "#dde3d0",
      // the house Gorilla green stays the accent
      "surface-ok": "#eef5ee",
      "badge-fill": "#a0306a", // azalea
    },
    stripe: { colors: ["#2e7d32", "#f4f6ec", "#e9a3c0", "#f4f6ec"], angle: 90, band: "1.5rem" },
  },
  {
    id: "summer",
    name: "Summer",
    kind: "season",
    on: true,
    from: "06-21",
    to: "09-21",
    colors: {
      "ink-muted": "#585448",
      "shirt-blank": "#f8f2e3", // beach sand
      rule: "#888070",
      "rule-faint": "#e6dcc5",
      "gorilla-green": "#0b6670", // harbour teal
      "gorilla-green-dark": "#07474e",
      "green-bright": "#6fd0da",
      "surface-ok": "#e2efed",
      "badge-fill": "#b13a12", // sunset
    },
    stripe: { colors: ["#0b6670", "#f8f2e3", "#f2b441", "#f8f2e3"], angle: 90, band: "1.5rem" },
  },
  {
    id: "fall",
    name: "Fall",
    kind: "season",
    on: true,
    from: "09-22",
    to: "12-20",
    colors: {
      "ink-black": "#1d150e",
      "ink-muted": "#5a4a3b",
      "shirt-blank": "#f7f0e4",
      rule: "#8b7a68",
      "rule-faint": "#e3d6c3",
      "gorilla-green": "#8c3f12", // maple
      "gorilla-green-dark": "#672e0c",
      "green-bright": "#e3a23a",
      "surface-ok": "#f2e5d6",
      "badge-fill": "#4d5d22", // olive
    },
    stripe: { colors: ["#8c3f12", "#e3a23a", "#4d5d22", "#f7f0e4"], angle: 90, band: "1.5rem" },
    decor: { drift: { shapes: ["leaf", "leaf-gold", "leaf-red"], count: 6, direction: "down" } },
  },
];
