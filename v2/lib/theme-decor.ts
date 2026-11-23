/**
 * The decor library: small drawings a theme in lib/theme-calendar.ts can
 * name for its header, corner or drift spots.
 *
 * Each is a self-contained inline SVG with its colours baked in. They are
 * never put in the page as markup: lib/season.ts turns the ones a theme
 * names into CSS background images, so the page carries one empty span per
 * spot all year, and a browser only draws the drawings of today's theme.
 *
 * Header and corner drawings use a 64 x 48 box; drift shapes a 24 x 24 one.
 */

const svg = (viewBox: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;

/* ---- PR 227's Christmas decor, the same paths and inks ---- */

const HOLLY = svg(
  "0 0 64 48",
  `<path fill="#1d5c34" d="M30 22 C26 20 22 17 19 20 L14 18 L15 23 L9 24 L12 28 L7 31 L13 33 L11 38 L17 37 L19 42 C24 36 29 30 30 22 Z"/>` +
    `<path fill="#154628" d="M34 22 C38 20 42 17 45 20 L50 18 L49 23 L55 24 L52 28 L57 31 L51 33 L53 38 L47 37 L45 42 C40 36 35 30 34 22 Z"/>` +
    `<path fill="none" stroke="#5f8f6c" stroke-width="1" d="M30 23 C26 29 22 35 18 40 M34 23 C38 29 42 35 46 40"/>` +
    `<g fill="#b3172f" stroke="#fbf7ef" stroke-width="1.3"><circle cx="28" cy="18" r="5"/><circle cx="36" cy="18" r="5"/><circle cx="32" cy="11" r="5"/></g>` +
    `<g fill="#f3c6cc"><circle cx="26.5" cy="16.5" r="1.4"/><circle cx="34.5" cy="16.5" r="1.4"/><circle cx="30.5" cy="9.5" r="1.4"/></g>`
);

const BELL =
  "M0 -14 C-6 -14 -9 -9 -9 -2 C-9 4 -11 7 -14 9 L14 9 C11 7 9 4 9 -2 C9 -9 6 -14 0 -14 Z";
const BELLS = svg(
  "0 0 64 48",
  `<g transform="translate(21 26) rotate(-16)"><path fill="#d6ac3a" stroke="#8c6a12" stroke-width="1.2" d="${BELL}"/><circle fill="#8c6a12" cx="0" cy="11.5" r="3"/></g>` +
    `<g transform="translate(43 26) rotate(16)"><path fill="#d6ac3a" stroke="#8c6a12" stroke-width="1.2" d="${BELL}"/><circle fill="#8c6a12" cx="0" cy="11.5" r="3"/></g>` +
    `<path fill="#b3172f" d="M32 8 L22 2 L23 13 Z M32 8 L42 2 L41 13 Z"/><circle fill="#b3172f" cx="32" cy="8" r="3.2"/>`
);

const FLAKE_ARM = "M0 0 L0 -10 M0 -6 L-3 -9 M0 -6 L3 -9 M0 -3 L-2 -5 M0 -3 L2 -5";
const SNOWFLAKE = svg(
  "-12 -12 24 24",
  `<g fill="none" stroke="#9fb4bd" stroke-width="1.6" stroke-linecap="round">` +
    [0, 60, 120, 180, 240, 300]
      .map((deg) => `<path d="${FLAKE_ARM}" transform="rotate(${deg})"/>`)
      .join("") +
    `</g>`
);

/* ---- Hearts ---- */

const HEART_D =
  "M12 21 C12 21 3 14.5 3 8.5 C3 5.4 5.4 3 8.4 3 C10 3 11.3 3.8 12 5 C12.7 3.8 14 3 15.6 3 C18.6 3 21 5.4 21 8.5 C21 14.5 12 21 12 21 Z";
const heart = (fill: string, edge: string) =>
  svg("0 0 24 24", `<path fill="${fill}" stroke="${edge}" stroke-width="1" d="${HEART_D}"/>`);
const HEARTS = svg(
  "0 0 64 48",
  `<g transform="translate(8 8) scale(1.45) rotate(-12 12 12)"><path fill="#f29bb8" stroke="#7d1536" stroke-width="0.8" d="${HEART_D}"/></g>` +
    `<g transform="translate(24 6) scale(1.6) rotate(10 12 12)"><path fill="#c2185b" stroke="#fbf1f3" stroke-width="0.8" d="${HEART_D}"/></g>`
);

/* ---- Shamrocks ---- */

const shamrockBody = (leaf: string, edge: string) =>
  `<path fill="none" stroke="${edge}" stroke-width="1.6" stroke-linecap="round" d="M0 1 C1 5 2 8 4 11"/>` +
  [0, 120, 240]
    .map(
      (deg) =>
        `<g transform="rotate(${deg})"><path fill="${leaf}" stroke="${edge}" stroke-width="0.9" transform="translate(-5.4 -9.45) scale(0.45)" d="${HEART_D}" /></g>`
    )
    .join("");
const shamrock = (leaf: string, edge: string) =>
  svg("-12 -12 24 24", `<g transform="rotate(180)">${shamrockBody(leaf, edge)}</g>`);
const SHAMROCKS = svg(
  "0 0 64 48",
  `<g transform="translate(22 24) scale(1.5) rotate(160)">${shamrockBody("#2e9e52", "#0e5129")}</g>` +
    `<g transform="translate(44 20) scale(1.15) rotate(200)">${shamrockBody("#16703a", "#eff6ec")}</g>`
);

/* ---- Easter ---- */

const egg = (cx: number, cy: number, rot: number, fill: string, band: string) =>
  `<g transform="translate(${cx} ${cy}) rotate(${rot})">` +
  `<ellipse rx="9" ry="12" fill="${fill}" stroke="#432c6d" stroke-width="1"/>` +
  `<path fill="none" stroke="${band}" stroke-width="1.8" stroke-linejoin="round" d="M-8.6 -1 L-5.6 2 L-2.8 -1 L0 2 L2.8 -1 L5.6 2 L8.6 -1"/>` +
  `<circle cx="-3" cy="-6" r="1.4" fill="${band}"/><circle cx="3" cy="6.5" r="1.4" fill="${band}"/></g>`;
const EGG = svg("0 0 64 48", egg(32, 24, 12, "#c9b3ee", "#ffffff"));
const EGGS = svg(
  "0 0 64 48",
  egg(24, 26, -16, "#f6e7a1", "#5e3f94") + egg(41, 24, 14, "#a9dcc8", "#ffffff")
);
const blossom = (petal: string, heart: string) =>
  svg(
    "-12 -12 24 24",
    [0, 72, 144, 216, 288]
      .map((deg) => `<ellipse transform="rotate(${deg})" cy="-5.5" rx="3.6" ry="5" fill="${petal}"/>`)
      .join("") + `<circle r="2.6" fill="${heart}"/>`
  );

/* ---- Mother's Day / Father's Day ---- */

const TULIP = svg(
  "0 0 64 48",
  `<path fill="none" stroke="#4f6b2e" stroke-width="2.4" stroke-linecap="round" d="M32 46 C32 36 31 30 32 24"/>` +
    `<path fill="#6f8f3a" d="M32 42 C24 40 20 34 19 27 C25 29 30 33 32 42 Z M32 40 C38 38 43 33 44 27 C38 29 34 33 32 40 Z"/>` +
    `<path fill="#d0577a" stroke="#6f2a3f" stroke-width="1" d="M23 8 L27.5 13 L32 4 L36.5 13 L41 8 C42 18 39 25 32 25 C25 25 22 18 23 8 Z"/>` +
    `<path fill="none" stroke="#f1a8bb" stroke-width="1.2" d="M32 6 C31 13 31 19 32 24"/>`
);
const NECKTIE = svg(
  "0 0 64 48",
  `<path fill="#284a72" stroke="#1b3453" stroke-width="1" d="M27 3 L37 3 L35 10 L29 10 Z"/>` +
    `<path fill="#284a72" stroke="#1b3453" stroke-width="1" d="M29 10 L35 10 L39 38 L32 46 L25 38 Z"/>` +
    `<path fill="none" stroke="#d6ac3a" stroke-width="1.6" d="M27.6 18 L36.6 24 M26.4 26 L37.8 33.5 M26 35 L33 39.5"/>`
);

/* ---- 4th of July / New Year's ---- */

const STAR_D = "M12 2 L14.6 8.9 L22 9.2 L16.2 13.8 L18.2 21 L12 16.9 L5.8 21 L7.8 13.8 L2 9.2 L9.4 8.9 Z";
const star = (fill: string, edge: string) =>
  svg("0 0 24 24", `<path fill="${fill}" stroke="${edge}" stroke-width="1" stroke-linejoin="round" d="${STAR_D}"/>`);
const STAR_HEADER = svg(
  "0 0 64 48",
  `<g transform="translate(6 10) scale(1.3)"><path fill="#b22234" stroke="#f6f6f8" stroke-width="0.8" stroke-linejoin="round" d="${STAR_D}"/></g>` +
    `<g transform="translate(30 4) scale(1.6)"><path fill="#1f3a6e" stroke="#f6f6f8" stroke-width="0.8" stroke-linejoin="round" d="${STAR_D}"/></g>`
);
const firework = (colors: string[]) =>
  svg(
    "0 0 64 48",
    Array.from({ length: 12 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 12;
      const inner = 5;
      const outer = i % 2 === 0 ? 20 : 15;
      const c = colors[i % colors.length];
      const x1 = (32 + inner * Math.cos(a)).toFixed(1);
      const y1 = (24 + inner * Math.sin(a)).toFixed(1);
      const x2 = (32 + outer * Math.cos(a)).toFixed(1);
      const y2 = (24 + outer * Math.sin(a)).toFixed(1);
      return (
        `<path stroke="${c}" stroke-width="2.4" stroke-linecap="round" d="M${x1} ${y1} L${x2} ${y2}"/>` +
        `<circle cx="${x2}" cy="${y2}" r="1.8" fill="${c}"/>`
      );
    }).join("") + `<circle cx="32" cy="24" r="2.6" fill="${colors[colors.length - 1]}"/>`
  );
const SPARKLE_D = "M0 -12 C1 -4 4 -1 12 0 C4 1 1 4 0 12 C-1 4 -4 1 -12 0 C-4 -1 -1 -4 0 -12 Z";
const SPARKLE = svg(
  "0 0 64 48",
  `<g transform="translate(26 24) scale(1.5)"><path fill="#e2b94b" stroke="#8a6a12" stroke-width="0.6" d="${SPARKLE_D}"/></g>` +
    `<g transform="translate(48 12) scale(0.7)"><path fill="#c9ccd8" stroke="#575464" stroke-width="0.8" d="${SPARKLE_D}"/></g>` +
    `<g transform="translate(50 36) scale(0.5)"><path fill="#e2b94b" d="${SPARKLE_D}"/></g>`
);
const SPARKLE_SMALL = svg(
  "-12 -12 24 24",
  `<path fill="#e2b94b" stroke="#8a6a12" stroke-width="0.8" transform="scale(0.8)" d="${SPARKLE_D}"/>`
);
const confetti = (a: string, b: string, c: string) =>
  svg(
    "0 0 24 24",
    `<rect x="3" y="4" width="7" height="3.5" fill="${a}" transform="rotate(-25 6.5 5.75)"/>` +
      `<rect x="13" y="9" width="3.5" height="7" fill="${b}" transform="rotate(20 14.75 12.5)"/>` +
      `<circle cx="7" cy="17" r="2.2" fill="${c}"/>` +
      `<path fill="none" stroke="${a}" stroke-width="1.6" stroke-linecap="round" d="M16 20 C18 18 17 16 19 14"/>`
  );

/* ---- October / Halloween / Thanksgiving ---- */

const MOON = svg(
  "0 0 64 48",
  `<path fill="#f0c75e" stroke="#8a6a12" stroke-width="1" d="M38 4 C26 6 19 16 21 28 C23 39 34 46 46 43 C36 41 29 33 29 23 C29 14 33 8 38 4 Z"/>` +
    `<g fill="#f08b2c"><circle cx="46" cy="12" r="1.6"/><circle cx="52" cy="24" r="1.1"/></g>`
);
const pumpkin = (face: boolean) =>
  svg(
    "0 0 64 48",
    `<path fill="none" stroke="#4d5d22" stroke-width="3" stroke-linecap="round" d="M32 14 C32 9 34 6 37 4"/>` +
      `<path fill="#6f8f3a" d="M34 10 C38 6 44 6 47 9 C43 12 38 12 34 10 Z"/>` +
      `<ellipse cx="22" cy="29" rx="11" ry="14" fill="#d9661a" stroke="#8a3d0a" stroke-width="1"/>` +
      `<ellipse cx="42" cy="29" rx="11" ry="14" fill="#d9661a" stroke="#8a3d0a" stroke-width="1"/>` +
      `<ellipse cx="32" cy="29" rx="10" ry="15" fill="#ee7d24" stroke="#8a3d0a" stroke-width="1"/>` +
      (face
        ? `<g fill="#2a1406"><path d="M22 24 L27 24 L24.5 19 Z M37 24 L42 24 L39.5 19 Z"/>` +
          `<path d="M20 31 C24 37 40 37 44 31 L40 32 L38 35 L35 32.5 L32 35.5 L29 32.5 L26 35 L24 32 Z"/></g>`
        : "")
  );
const LEAF_D =
  "M12 2 L13.5 7 L17 5 L16 9.5 L21 9 L18 12.5 L20.5 15 L15 14.5 L13 18 L12.6 22 L11.4 22 L11 18 L9 14.5 L3.5 15 L6 12.5 L3 9 L8 9.5 L7 5 L10.5 7 Z";
const leaf = (fill: string, edge: string) =>
  svg("0 0 24 24", `<path fill="${fill}" stroke="${edge}" stroke-width="0.8" stroke-linejoin="round" d="${LEAF_D}"/>`);
const LEAF_CORNER = svg(
  "0 0 64 48",
  `<g transform="translate(6 6) scale(1.5) rotate(-20 12 12)"><path fill="#c0561a" stroke="#5c2a0c" stroke-width="0.7" stroke-linejoin="round" d="${LEAF_D}"/></g>` +
    `<g transform="translate(28 10) scale(1.3) rotate(24 12 12)"><path fill="#e2a72e" stroke="#6b4a0a" stroke-width="0.7" stroke-linejoin="round" d="${LEAF_D}"/></g>`
);
const BAT_D =
  "M12 9 C10 6 7 5 2 6 C4 7 4.5 8.5 4 10 C6 9.5 7.5 10 8.5 11.5 C9.5 10.5 10.8 10.4 12 11.5 C13.2 10.4 14.5 10.5 15.5 11.5 C16.5 10 18 9.5 20 10 C19.5 8.5 20 7 22 6 C17 5 14 6 12 9 Z M10.6 8.8 L10.4 6.6 L11.5 7.8 L12.5 7.8 L13.6 6.6 L13.4 8.8 Z";
const bat = (fill: string) => svg("0 0 24 24", `<path fill="${fill}" d="${BAT_D}"/>`);
const BAT_HEADER = svg(
  "0 0 64 48",
  `<g transform="translate(2 4) scale(2.5)"><path fill="#140e17" d="${BAT_D}"/></g>`
);

/** Every drawing a theme may name. */
export const DECOR: Readonly<Record<string, string>> = {
  holly: HOLLY,
  bells: BELLS,
  snowflake: SNOWFLAKE,
  heart: heart("#c2185b", "#7d1536"),
  "heart-pink": heart("#f29bb8", "#a81f4b"),
  hearts: HEARTS,
  shamrock: shamrock("#16703a", "#0e5129"),
  "shamrock-light": shamrock("#7fd796", "#16703a"),
  shamrocks: SHAMROCKS,
  egg: EGG,
  eggs: EGGS,
  blossom: blossom("#f5c2d3", "#f2c14e"),
  "blossom-yellow": blossom("#f6e7a1", "#e08a3a"),
  "blossom-rose": blossom("#e88aa5", "#fbf3f2"),
  tulip: TULIP,
  necktie: NECKTIE,
  star: star("#b22234", "#7a1622"),
  "star-blue": star("#1f3a6e", "#13264b"),
  "star-gold": star("#e2b94b", "#8a6a12"),
  "star-header": STAR_HEADER,
  firework: firework(["#b22234", "#1f3a6e", "#e2b94b"]),
  sparkle: SPARKLE,
  "sparkle-small": SPARKLE_SMALL,
  confetti: confetti("#e2b94b", "#22305a", "#b22234"),
  "confetti-blue": confetti("#7d9ad6", "#e2b94b", "#c9ccd8"),
  moon: MOON,
  pumpkin: pumpkin(false),
  "jack-o-lantern": pumpkin(true),
  leaf: leaf("#c0561a", "#5c2a0c"),
  "leaf-gold": leaf("#e2a72e", "#6b4a0a"),
  "leaf-red": leaf("#8a1f2d", "#4a0f18"),
  "leaf-corner": LEAF_CORNER,
  bat: bat("#140e17"),
  "bat-purple": bat("#5a2c85"),
  "bat-header": BAT_HEADER,
};

/** A drawing as a CSS url() value. */
export function decorUrl(name: string): string {
  const art = DECOR[name];
  if (!art) throw new Error(`theme-decor: no drawing called "${name}"`);
  // Light escaping (the usual data-URI trick): single-quote the attributes
  // and escape only what a URL or CSS string can't hold. About a third of
  // the size of encodeURIComponent, and every browser reads it.
  const body = art
    .replace(/"/g, "'")
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\s+/g, " ");
  return `url("data:image/svg+xml,${body}")`;
}
