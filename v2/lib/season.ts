/**
 * Seasonal colour themes (Gabe, 2026-11-23: "fall Thanksgiving colors", then
 * "after November ends on December 1st, I want it to switch to Christmas
 * colors").
 *
 * A season only RECOLOURS. Every ink it touches is a token in
 * app/globals.css, overridden under `html[data-theme="<id>"]`; layout, type
 * and content never change. Outside every season the attribute is absent
 * and the house Order Desk inks apply exactly as before.
 *
 * Christmas runs through 31 December. The house colours come back on
 * 1 January.
 *
 * Seasons are month-day ranges on the shop's clock (America/New_York), so
 * they come round every year with nothing to edit. To add one: a row here,
 * a block in globals.css, a row in tests/season.test.ts.
 *
 * WHY THE CHOICE IS MADE IN THE BROWSER. The page is statically rendered at
 * build time, so a season picked on the server would be frozen to the day of
 * the last deploy and Christmas would never arrive on its own. A few lines
 * run in <head> before first paint instead (seasonThemeScript below), so
 * there is no flash of the wrong colours and no deploy on 1 December.
 */

export type SeasonId = "thanksgiving" | "christmas";

export interface Season {
  id: SeasonId;
  /** First day, MM-DD, inclusive. */
  from: string;
  /** Last day, MM-DD, inclusive. */
  to: string;
}

export const SEASONS: readonly Season[] = [
  { id: "thanksgiving", from: "11-01", to: "11-30" },
  { id: "christmas", from: "12-01", to: "12-31" },
];

/** `?theme=` values: a season, or "default" to see the house colours. */
export const THEME_PARAM = "theme";
export const DEFAULT_THEME = "default";

export const SHOP_TIME_ZONE = "America/New_York";

/**
 * The tag beside "Happy Thanksgiving from Gorilla" in the Thanksgiving
 * banner. A placeholder for now (Gabe, 2026-11-23: "For now, as a
 * placeholder, let's just have it say Black Friday deals."). Change the words
 * here to name the real deal; set it to "" to hide the tag. Plain words
 * only: it is not a link and carries no price.
 */
export const THANKSGIVING_TAG = "Black Friday Deals";

/** Today on the shop's clock, as MM-DD. */
export function shopMonthDay(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${month}-${day}`;
}

/** The season a shop-clock MM-DD falls in, or null for the house colours. */
export function seasonFor(monthDay: string): SeasonId | null {
  for (const season of SEASONS) {
    if (monthDay >= season.from && monthDay <= season.to) return season.id;
  }
  return null;
}

/**
 * The theme to show: a valid `?theme=` preview wins, then the calendar.
 * Anything unrecognised in the param is ignored rather than trusted.
 */
export function resolveTheme(
  param: string | null | undefined,
  monthDay: string
): SeasonId | null {
  if (param === DEFAULT_THEME) return null;
  const preview = SEASONS.find((s) => s.id === param);
  if (preview) return preview.id;
  return seasonFor(monthDay);
}

/**
 * The inline <head> script. Same rules as resolveTheme(), written out in
 * plain ES5 because it runs before any bundle; tests/season.test.ts runs it
 * against resolveTheme() so the two cannot drift. Fails closed: any error
 * leaves the house colours.
 */
export function seasonThemeScript(): string {
  const table = JSON.stringify(
    SEASONS.map((s) => [s.id, s.from, s.to])
  );
  return (
    "(function(){try{" +
    `var S=${table},D=${JSON.stringify(DEFAULT_THEME)};` +
    `var q=new URLSearchParams(location.search).get(${JSON.stringify(THEME_PARAM)});` +
    `var p=new Intl.DateTimeFormat("en-US",{timeZone:${JSON.stringify(SHOP_TIME_ZONE)},month:"2-digit",day:"2-digit"}).formatToParts(new Date());` +
    'var m="01",d="01";for(var i=0;i<p.length;i++){if(p[i].type==="month")m=p[i].value;if(p[i].type==="day")d=p[i].value;}' +
    'var md=m+"-"+d,t=null;' +
    "if(q!==D){for(var j=0;j<S.length;j++){if(S[j][0]===q){t=q;break;}}" +
    "if(!t){for(var k=0;k<S.length;k++){if(md>=S[k][1]&&md<=S[k][2]){t=S[k][0];break;}}}}" +
    'if(t)document.documentElement.setAttribute("data-theme",t);' +
    "}catch(e){}})();"
  );
}
