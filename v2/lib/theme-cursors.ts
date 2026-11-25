/**
 * Holiday cursors: a small animated character that follows the mouse while
 * a holiday theme is on, with a little reaction when the customer clicks.
 *
 * Gabe, 2026-11-23: "When it's Christmas time, maybe it's Santa Claus in a
 * sleigh as the cursor. And he's animated and he's saying ho ho ho", then
 * "continue that theme with all the other holidays, turkey, etc.", a
 * Cupid's bow and arrow for Valentine's Day, a witch on a broom for
 * Halloween, and: "I want it to be usable still too though, so it can't
 * interrupt when they're trying to pick certain things on the site."
 *
 * A theme names its cursor in lib/theme-calendar.ts (decor.cursor). This
 * file is loaded only in a browser that will show one (components/
 * ThemeCursor.tsx imports it on demand), so it costs nothing on phones or
 * outside the holidays.
 *
 * Every drawing is original. Each is 48 high; `hotspot` is the point of the
 * drawing that sits exactly on the mouse tip, so a click lands where the
 * customer aims. Parts with a `tc-*` class move (app/globals.css), only for
 * visitors who have not asked for less motion.
 */

export interface CursorSpec {
  /** What it is, for the record. */
  name: string;
  /** Inline SVG. */
  art: string;
  width: number;
  height: number;
  /** Where the mouse tip sits on the drawing, in px from its top-left. */
  hotspot: [number, number];
  /** What happens on a click on open page (never on a control). */
  click: {
    /** A speech bubble, shown for about a second. */
    text?: string;
    /** Little shapes from lib/theme-decor.ts that pop out. */
    burst?: { shapes: string[]; count: number; mode: "ring" | "shoot" };
    /** A short, quiet sound made in the browser (no audio files). */
    sound?: "pop" | "twang" | "chime";
    /** Spoken by the browser's own voice, quietly. Christmas only. */
    say?: { text: string; pitch: number; rate: number };
    /** The character itself does a little move. */
    move?: "hop" | "spin" | "shake";
  };
}

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

/* Santa in his sleigh, pulled by a reindeer. Rudolph's red nose is the tip. */
const SANTA = svg(
  76,
  48,
  `<g class="tc-bob">` +
    // reins
    `<path d="M16 22 C26 25 33 23 42 25" stroke="#8c6a12" stroke-width="1.3" fill="none"/>` +
    // reindeer
    `<g class="tc-gallop" stroke="#5c3a1a" stroke-width="2" stroke-linecap="round"><path d="M13 26 L10 33 M17 27 L16 34 M22 27 L25 33 M26 25 L30 31"/></g>` +
    `<ellipse cx="19" cy="23" rx="9" ry="5" fill="#8a5a2b"/>` +
    `<path d="M12 21 C10 17 8 14 7 11" stroke="#8a5a2b" stroke-width="4.5" stroke-linecap="round" fill="none"/>` +
    `<ellipse cx="6.5" cy="10" rx="4" ry="3" fill="#8a5a2b"/>` +
    `<path d="M8 7.5 L10.5 2.5 M9.6 4.4 L12.5 3.6 M6.5 7.2 L4.6 2.6 M5.2 4.2 L2.8 4.4" stroke="#6b4a1a" stroke-width="1.4" stroke-linecap="round" fill="none"/>` +
    `<circle cx="7.6" cy="9" r="0.9" fill="#1a1a1a"/>` +
    `<circle class="tc-glow" cx="3" cy="11" r="2.6" fill="#e0262f"/>` +
    // sleigh
    `<path d="M40 25 L70 25 C72.5 25 73.5 27.5 72 30.5 L68 37 L44 37 C41 37 39 33 40 25 Z" fill="#c8102e" stroke="#7a0a1b" stroke-width="1"/>` +
    `<path d="M44 33 L68 33" stroke="#d6ac3a" stroke-width="1.4"/>` +
    `<path d="M37 41 L70 41 C74 41 75 38 73 36" stroke="#d6ac3a" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
    `<path d="M46 37 L46 41 M64 37 L64 41" stroke="#d6ac3a" stroke-width="1.8"/>` +
    // Santa
    `<path d="M48 25 C48 17 52 14 56 14 C60 14 64 17 64 25 Z" fill="#c8102e"/>` +
    `<path d="M48 22 L64 22" stroke="#fff" stroke-width="1.6"/>` +
    `<circle cx="56" cy="11" r="4.4" fill="#f2c9a0"/>` +
    `<path d="M51.5 11 C51.5 16.5 54 19 56 19 C58 19 60.5 16.5 60.5 11 C59 13.5 53 13.5 51.5 11 Z" fill="#ffffff" stroke="#d9d9d9" stroke-width="0.5"/>` +
    `<path d="M51.6 8.4 C51.6 3.5 58 2.2 62.5 5.4 L64.5 9.5 L60.5 8.4 Z" fill="#c8102e"/>` +
    `<path d="M51 8.5 L60.6 8.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>` +
    `<circle cx="64.6" cy="9.6" r="1.8" fill="#fff"/>` +
    `<circle cx="54.4" cy="10.6" r="0.7" fill="#1a1a1a"/><circle cx="57.6" cy="10.6" r="0.7" fill="#1a1a1a"/>` +
    `<g class="tc-wave"><path d="M49 18 L44 12" stroke="#c8102e" stroke-width="3.2" stroke-linecap="round"/><circle cx="43.5" cy="11.2" r="2" fill="#1d5c34"/></g>` +
    `</g>`
);

/* A plump turkey, head forward; the beak is the tip. */
const TURKEY = svg(
  48,
  48,
  `<g class="tc-bob">` +
    `<g class="tc-fan">` +
    `<path d="M28 30 L46 14 L44 26 Z" fill="#8a1f2d"/>` +
    `<path d="M28 30 L40 6 L44 18 Z" fill="#d9661a"/>` +
    `<path d="M28 30 L30 4 L38 10 Z" fill="#e2a72e"/>` +
    `<path d="M28 30 L46 30 L44 38 Z" fill="#d9661a"/>` +
    `<path d="M28 30 L20 6 L28 4 Z" fill="#8a1f2d"/>` +
    `</g>` +
    `<ellipse cx="27" cy="32" rx="11" ry="9" fill="#6b4226"/>` +
    `<path d="M20 36 L19 43 M26 39 L26 45" stroke="#d9a02b" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M19 28 C15 24 13 18 11 13" stroke="#7a4b2a" stroke-width="5" stroke-linecap="round" fill="none"/>` +
    `<g class="tc-peck"><circle cx="10" cy="10" r="4.6" fill="#7a4b2a"/>` +
    `<path d="M6.5 9 L1.5 6.5 L6.8 11.5 Z" fill="#e2a72e"/>` +
    `<path d="M8 13 C6 16 7 19 9 18 C10 16.5 9.5 14.5 9 13 Z" fill="#d22b2b"/>` +
    `<circle cx="10.2" cy="8.6" r="1.1" fill="#fff"/><circle cx="10" cy="8.7" r="0.6" fill="#1a1a1a"/></g>` +
    `</g>`
);

/* Cupid's bow and arrow; the heart arrowhead is the tip (Gabe's pick). */
const CUPID = svg(
  48,
  48,
  `<g class="tc-bob">` +
    `<g class="tc-draw"><path d="M10 34 C12 18 22 10 38 10" stroke="#8a5a2b" stroke-width="3" stroke-linecap="round" fill="none"/>` +
    `<path d="M10 34 L38 10" stroke="#e8d9c0" stroke-width="1"/></g>` +
    `<path d="M7 7 L42 42" stroke="#7d1536" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M42 42 L36 44 L38 38 Z M42 42 L44 36 L38 38 Z" fill="#f29bb8"/>` +
    `<path class="tc-glow" d="M2 2 C2 2 3 9.5 5 12 C7 13.5 10 12.5 10 10 C12.5 10 13.5 7 12 5 C9.5 3 2 2 2 2 Z" fill="#c2185b" stroke="#7d1536" stroke-width="0.8"/>` +
    `</g>`
);

/* A witch flying on her broom, an original silhouette. The broom tip leads. */
const WITCH = svg(
  60,
  48,
  `<g class="tc-bob">` +
    `<path d="M2 6 L40 30" stroke="#5a3a1a" stroke-width="2.4" stroke-linecap="round"/>` +
    `<g class="tc-sweep"><path d="M38 28 C44 28 54 32 58 40 C50 38 44 38 38 34 Z" fill="#c98b2e"/>` +
    `<path d="M40 31 L56 38 M40 33 L52 40" stroke="#8a5a1a" stroke-width="0.8"/></g>` +
    // cloak streaming back
    `<g class="tc-cape"><path d="M22 16 C30 14 40 18 46 24 C40 24 34 24 28 24 Z" fill="#2a1a33"/></g>` +
    // body sitting on broom
    `<path d="M16 20 C16 14 20 12 23 13 C26 14 28 18 28 24 L20 23 Z" fill="#140e17"/>` +
    `<path d="M20 23 L14 26 L16 28 L22 25 Z" fill="#140e17"/>` +
    // head, nose, hair
    `<circle cx="18" cy="10" r="3.4" fill="#140e17"/>` +
    `<path d="M15 10.5 L11.5 12 L15 11.6 Z" fill="#140e17"/>` +
    `<path d="M20 10 C24 11 26 14 27 17 C24 15 22 14 20 13 Z" fill="#140e17"/>` +
    // hat
    `<path d="M12 7.5 L26 6.5 L23 5 L23.5 -0.5 C22 1.5 19 3.5 17 5.5 Z" fill="#140e17"/>` +
    `<path d="M17.6 5.6 L22.6 5.2" stroke="#7a3db8" stroke-width="1.2"/>` +
    `</g>`
);

/* A black cat with a swishing tail for October in Salem; the ear tip leads. */
const CAT = svg(
  48,
  48,
  `<g class="tc-bob">` +
    `<g class="tc-tail"><path d="M30 38 C40 38 44 30 42 22 C41 18 38 18 38 21 C40 28 36 33 30 34" fill="#140e17"/></g>` +
    `<path d="M14 40 C12 30 14 22 22 20 C30 20 33 28 32 40 Z" fill="#140e17"/>` +
    `<path d="M10 16 C9 10 2 2 2 2 L9 7 C11 5 16 5 18 7 L23 3 C23 3 22 11 21 15 C21 20 16 22 14 22 C11 21 10 19 10 16 Z" fill="#140e17"/>` +
    `<path d="M12 12 L14 11 M17 12 L19 11" stroke="#f0c75e" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M15.6 15 L16.4 15" stroke="#e88aa5" stroke-width="1.2" stroke-linecap="round"/>` +
    `</g>`
);

/* A gold-buckled green hat with a shamrock; its brim corner leads. */
const LEPRECHAUN = svg(
  48,
  48,
  `<g class="tc-bob">` +
    `<path d="M2 3 L44 27 L40 32 L4 12 Z" fill="#0e5129"/>` +
    `<path d="M12 12 L22 1 L44 14 L34 27 Z" fill="#16703a"/>` +
    `<path d="M13 13 L33 25 L36 21 L16 9 Z" fill="#140e17"/>` +
    `<rect x="21" y="13.5" width="5" height="5" fill="none" stroke="#e2b94b" stroke-width="1.6" transform="rotate(30 23.5 16)"/>` +
    `<g class="tc-glow" transform="translate(38 9) scale(0.55)">` +
    [0, 120, 240]
      .map(
        (d) =>
          `<g transform="rotate(${d})"><path transform="translate(-5.4 -9.45) scale(0.45)" fill="#2e9e52" d="M12 21 C12 21 3 14.5 3 8.5 C3 5.4 5.4 3 8.4 3 C10 3 11.3 3.8 12 5 C12.7 3.8 14 3 15.6 3 C18.6 3 21 5.4 21 8.5 C21 14.5 12 21 12 21 Z"/></g>`
      )
      .join("") +
    `</g></g>`
);

/* An Easter bunny peeking up; the tip of the left ear leads. */
const BUNNY = svg(
  48,
  48,
  `<g class="tc-bob">` +
    `<g class="tc-ear"><path d="M14 22 C8 16 3 8 2 2 C8 4 16 12 19 20 Z" fill="#f4eee8" stroke="#8b7f8f" stroke-width="1"/>` +
    `<path d="M14 19 C10 14 6 9 5 6 C9 8 14 13 16 18 Z" fill="#f3b6c8"/></g>` +
    `<path d="M22 19 C22 12 26 5 30 2 C32 8 30 15 27 21 Z" fill="#f4eee8" stroke="#8b7f8f" stroke-width="1"/>` +
    `<ellipse cx="21" cy="29" rx="11" ry="10" fill="#f4eee8" stroke="#8b7f8f" stroke-width="1"/>` +
    `<circle cx="17" cy="27" r="1.3" fill="#140e17"/><circle cx="25" cy="27" r="1.3" fill="#140e17"/>` +
    `<path d="M19.6 31 L22.4 31 L21 32.6 Z" fill="#e88aa5"/>` +
    `<ellipse cx="34" cy="38" rx="6" ry="8" fill="#c9b3ee" stroke="#5e3f94" stroke-width="1" transform="rotate(20 34 38)"/>` +
    `<path d="M29 37 L32 35 L35 37 L38 35" stroke="#fff" stroke-width="1.4" fill="none" transform="rotate(20 34 38)"/>` +
    `</g>`
);

/* A little bouquet of tulips; the top petal leads. */
const BOUQUET = svg(
  48,
  48,
  `<g class="tc-bob">` +
    `<path d="M8 10 L30 40 M18 6 L30 40 M5 20 L30 40" stroke="#4f6b2e" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M24 32 L36 30 L34 44 L26 46 Z" fill="#f1a8bb" stroke="#963a55" stroke-width="1"/>` +
    `<g class="tc-sway"><path d="M2 2 L6 5 L9 1 L11 6 L14 4 C14 10 11 13 8 13 C4 13 2 9 2 2 Z" fill="#d0577a" stroke="#6f2a3f" stroke-width="0.8"/>` +
    `<path d="M14 0 L17 3 L19 0 L21 4 L24 2 C24 8 21 10 18.5 10 C15.5 10 14 7 14 0 Z" fill="#e2a72e" stroke="#8a5a1a" stroke-width="0.8"/>` +
    `<path d="M0 14 L3 16.5 L5 13.5 L7 17 L9.5 15.5 C9.5 20.5 7 23 4.5 23 C1.5 23 0 19.5 0 14 Z" fill="#c9b3ee" stroke="#5e3f94" stroke-width="0.8"/></g>` +
    `</g>`
);

/* A grill spatula flipping a burger for Father's Day; the blade corner leads. */
const SPATULA = svg(
  48,
  48,
  `<g class="tc-bob">` +
    `<path d="M14 14 L42 42" stroke="#7a4a22" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M2 2 L18 4 L18 14 L14 18 L4 18 Z" fill="#b8bec8" stroke="#4f5560" stroke-width="1"/>` +
    `<path d="M7 7 L13 7 M7 11 L13 11 M7 15 L11 15" stroke="#4f5560" stroke-width="1"/>` +
    `<g class="tc-flip"><ellipse cx="26" cy="8" rx="7" ry="3" fill="#e2a72e"/>` +
    `<ellipse cx="26" cy="11" rx="7.5" ry="2.4" fill="#6b3a1a"/>` +
    `<path d="M19 12.5 L33 12.5" stroke="#4f8a2e" stroke-width="1.4"/></g>` +
    `</g>`
);

/* A firework rocket for the 4th of July; the nose cone leads. */
const ROCKET = svg(
  48,
  48,
  `<g class="tc-bob">` +
    `<g class="tc-flame"><path d="M30 30 C36 36 44 38 46 46 C38 44 36 36 30 30 Z" fill="#e2b94b"/>` +
    `<path d="M30 30 C34 35 38 37 40 42 C35 40 33 35 30 30 Z" fill="#f0603a"/></g>` +
    `<path d="M2 2 L10 4 L32 26 L26 32 L4 10 Z" fill="#f6f6f8" stroke="#1f3a6e" stroke-width="1"/>` +
    `<path d="M2 2 L10 4 L8 8 L4 10 Z" fill="#b22234"/>` +
    `<path d="M14 14 L18 10 M20 20 L24 16" stroke="#b22234" stroke-width="3"/>` +
    `<path d="M26 32 L24 38 L30 34 Z M32 26 L38 24 L34 30 Z" fill="#1f3a6e"/>` +
    `</g>`
);

/* A champagne bottle with the cork about to pop, for New Year's. */
const BOTTLE = svg(
  48,
  48,
  `<g class="tc-bob">` +
    `<path d="M10 10 L16 6 L26 16 C34 20 42 28 44 36 C46 42 42 46 36 44 C28 42 20 34 16 26 Z" fill="#1d4a2c" stroke="#0f2a18" stroke-width="1"/>` +
    `<path d="M10 10 L16 6 L20 10 L14 14 Z" fill="#e2b94b"/>` +
    `<path d="M24 26 L34 36" stroke="#e2b94b" stroke-width="5"/>` +
    `<g class="tc-cork"><path d="M2 2 L8 2 L10 8 L4 10 Z" fill="#c98b5a" stroke="#7a4a22" stroke-width="0.8"/></g>` +
    `</g>`
);

export const CURSORS: Readonly<Record<string, CursorSpec>> = {
  santa: {
    name: "Santa in his sleigh",
    art: SANTA,
    width: 76,
    height: 48,
    hotspot: [1, 11],
    click: {
      text: "Ho ho ho!",
      say: { text: "Ho ho ho", pitch: 0.4, rate: 0.85 },
      burst: { shapes: ["snowflake"], count: 6, mode: "ring" },
    },
  },
  turkey: {
    name: "Turkey",
    art: TURKEY,
    width: 48,
    height: 48,
    hotspot: [2, 7],
    click: {
      text: "Gobble gobble!",
      burst: { shapes: ["leaf", "leaf-gold", "leaf-red"], count: 6, mode: "ring" },
      move: "shake",
    },
  },
  cupid: {
    name: "Cupid's bow and arrow",
    art: CUPID,
    width: 48,
    height: 48,
    hotspot: [2, 2],
    click: {
      burst: { shapes: ["heart"], count: 1, mode: "shoot" },
      sound: "twang",
    },
  },
  witch: {
    name: "Witch on a broom",
    art: WITCH,
    width: 60,
    height: 48,
    hotspot: [2, 6],
    click: {
      text: "Hee hee hee!",
      burst: { shapes: ["sparkle-small", "bat-purple"], count: 6, mode: "ring" },
    },
  },
  cat: {
    name: "Black cat",
    art: CAT,
    width: 48,
    height: 48,
    hotspot: [2, 2],
    click: {
      text: "Meow!",
      burst: { shapes: ["leaf", "leaf-gold"], count: 5, mode: "ring" },
      move: "hop",
    },
  },
  leprechaun: {
    name: "Leprechaun hat",
    art: LEPRECHAUN,
    width: 48,
    height: 48,
    hotspot: [2, 3],
    click: {
      text: "Top o' the morning!",
      burst: { shapes: ["coin", "shamrock"], count: 6, mode: "ring" },
      sound: "chime",
    },
  },
  bunny: {
    name: "Easter bunny",
    art: BUNNY,
    width: 48,
    height: 48,
    hotspot: [2, 2],
    click: {
      text: "Hop hop!",
      burst: { shapes: ["egg-small", "blossom-yellow"], count: 6, mode: "ring" },
      move: "hop",
    },
  },
  bouquet: {
    name: "Tulip bouquet",
    art: BOUQUET,
    width: 48,
    height: 48,
    hotspot: [2, 2],
    click: {
      text: "Love you, Mom!",
      burst: { shapes: ["blossom", "blossom-rose"], count: 6, mode: "ring" },
    },
  },
  spatula: {
    name: "Grill spatula",
    art: SPATULA,
    width: 48,
    height: 48,
    hotspot: [2, 2],
    click: {
      text: "Thanks, Dad!",
      burst: { shapes: ["star-gold"], count: 5, mode: "ring" },
      move: "spin",
    },
  },
  rocket: {
    name: "Firework rocket",
    art: ROCKET,
    width: 48,
    height: 48,
    hotspot: [2, 2],
    click: {
      burst: { shapes: ["star", "star-blue", "star-gold"], count: 9, mode: "ring" },
      sound: "pop",
    },
  },
  bottle: {
    name: "Champagne bottle",
    art: BOTTLE,
    width: 48,
    height: 48,
    hotspot: [2, 2],
    click: {
      text: "Happy New Year!",
      burst: { shapes: ["confetti", "confetti-blue", "sparkle-small"], count: 9, mode: "ring" },
      sound: "pop",
    },
  },
};
