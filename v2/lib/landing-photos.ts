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

/** The thirteen thumbs' codes (lib/landing.ts buildOfferings), for the map below. */
export type OfferingCode =
  | "STK" | "BNR" | "YRD" | "RGD" | "PST" | "WIN" | "TEE"
  | "BCD" | "RCK" | "PCD" | "TRI" | "MNU" | "LTR";

export const LANDING_PHOTOS: Partial<
  Record<"stickers" | "banners" | "signs" | "apparel" | "paper", LandingPhoto>
> = {};

/**
 * A PHOTOGRAPH FOR EACH THUMB IN THE "EVERYTHING WE MAKE" GRID.
 *
 * Same rule, same emptiness: a thumb with no entry shows its emblem. SQUARE
 * images here (the tile is square, the picture is cropped to fill it), keyed
 * by the thumb's code —
 *
 *   TEE: { src: "/landing/tee.jpg", alt: "A black tee printed on the chest" },
 *
 * Codes: STK stickers, BNR banners, YRD yard signs, RGD rigid signs, PST
 * posters, WIN window graphics, TEE tees & hoodies, BCD business cards, RCK rack
 * cards, PCD postcards, TRI trifolds, MNU menus, LTR letterhead.
 */
export const OFFERING_PHOTOS: Partial<Record<OfferingCode, LandingPhoto>> = {};
