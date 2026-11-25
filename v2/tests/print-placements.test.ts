import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { apparelCatalog } from "../lib/apparel";
import {
  garmentFamily,
  getPrintPlacement,
  keepOfferedPlacements,
  placementsFor,
  printPlacements,
  togglePlacement,
} from "../lib/print-placements";

/**
 * Gabe's placement chart (2026-11-21): the choices a customer gets, which
 * garments take which, and that overlapping ones replace each other.
 */

describe("the chart", () => {
  test("the order form offers exactly the chart's placements", () => {
    assert.deepEqual(
      [...apparelCatalog.printLocations].sort(),
      printPlacements.map((placement) => placement.id).sort()
    );
  });

  test("Front and Back keep their names — saved quotes and prices say them", () => {
    assert.equal(getPrintPlacement("Front")?.side, "front");
    assert.equal(getPrintPlacement("Back")?.side, "back");
  });

  test("a tee takes all eight", () => {
    assert.equal(placementsFor("tee").length, 8);
  });

  test("a hoodie loses the oversize front (pocket) and the collar back (hood)", () => {
    const ids = placementsFor("hoodie").map((placement) => placement.id);
    assert.ok(!ids.includes("Oversize Front"));
    assert.ok(!ids.includes("Collar Back"));
    assert.ok(ids.includes("Front") && ids.includes("Back") && ids.includes("Left Chest"));
  });

  test("the family comes from the S&S style, else the garment's name", () => {
    assert.equal(garmentFamily({ catalogStyle: "395" }), "hoodie");
    assert.equal(garmentFamily({ catalogStyle: "39" }), "tee");
    assert.equal(garmentFamily({ garmentType: "Classic Hoodie" }), "hoodie");
    assert.equal(garmentFamily({ garmentType: "Crewnecks" }), "crewneck");
    assert.equal(garmentFamily({ garmentType: "Long Sleeves" }), "longSleeve");
    assert.equal(garmentFamily({ garmentType: "T-Shirts" }), "tee");
  });
});

describe("picking placements", () => {
  test("one per side: a left chest replaces a full front", () => {
    assert.deepEqual(togglePlacement(["Front"], "Left Chest"), ["Left Chest"]);
  });

  test("an upper back replaces a full back, and the front is kept", () => {
    assert.deepEqual(togglePlacement(["Front", "Back"], "Upper Back"), ["Front", "Upper Back"]);
  });

  test("left chest plus full back plus sleeve plus collar back all combine", () => {
    let picked: string[] = [];
    for (const id of ["Left Chest", "Back", "Sleeve", "Collar Back"]) {
      picked = togglePlacement(picked, id);
    }
    assert.deepEqual(picked, ["Left Chest", "Back", "Sleeve", "Collar Back"]);
  });

  test("tapping a picked placement takes it off", () => {
    assert.deepEqual(togglePlacement(["Front", "Back"], "Back"), ["Front"]);
  });
});

describe("switching garments", () => {
  test("an oversize front becomes a full front on a hoodie", () => {
    assert.deepEqual(keepOfferedPlacements(["Oversize Front", "Back"], "hoodie"), ["Front", "Back"]);
  });

  test("a collar back is dropped on a hoodie, the rest kept", () => {
    assert.deepEqual(keepOfferedPlacements(["Left Chest", "Collar Back"], "hoodie"), ["Left Chest"]);
  });

  test("text this file does not know is kept for the shop to read", () => {
    assert.deepEqual(keepOfferedPlacements(["Inside tag"], "hoodie"), ["Inside tag"]);
  });

  test("a tee keeps everything", () => {
    assert.deepEqual(
      keepOfferedPlacements(["Oversize Front", "Collar Back"], "tee"),
      ["Oversize Front", "Collar Back"]
    );
  });
});
