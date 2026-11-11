/**
 * THE SHOP'S OWN PHOTOGRAPHS FOR THE FRONT-DOOR PANELS.
 *
 * Empty on purpose. Gabe, 2026-11-11, asked for the front door as a row of
 * tall photo panels (one per product family, a big label across the bottom).
 * The shop has not supplied the photographs yet, and the page does not invent
 * them: no stock images, no generated ones passed off as work. A panel with no
 * entry here shows its emblem on a flat field instead (features/landing).
 *
 * To light a panel up: put the file under `public/landing/` and add it here —
 *
 *   stickers: { src: "/landing/stickers.jpg", alt: "Die-cut stickers on a sheet" },
 *
 * Portrait, about 2:3 (the panels are tall), and under ~300 KB; the page
 * shows five of them at once. `alt` says what is IN the picture — the panel's
 * button already carries the product name.
 */
export type LandingPhoto = { src: string; alt: string };

export const LANDING_PHOTOS: Partial<
  Record<"stickers" | "banners" | "signs" | "apparel" | "paper", LandingPhoto>
> = {};
