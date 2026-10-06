/**
 * THE SUITE, RUN AS IF TIME HAD PASSED.
 *
 * ── WHAT THIS IS FOR ──────────────────────────────────────────────────────
 * On 2 October 2026 the suite went red and stayed red for four days. Nothing
 * had broken. `tests/shipping.test.ts` pinned an order's `needBy` to the
 * literal 2026-10-01, that date arrived, `isOrderReady` started returning
 * false, and a test that asserted a valid order was valid began failing on
 * the calendar.
 *
 * The expensive part was not the red. It was that the green check recorded
 * on the open PR predated the expiry, so the one signal that would have
 * caught a real regression had already been spent on a date nobody picked.
 * A test like that does not fail when it is written, or when it is reviewed,
 * or when it is merged. It fails on a Tuesday, to whoever happens to be
 * looking.
 *
 * So the suite is run a second time with the clock pushed forward. A fixture
 * that is only valid until some date now fails in the pull request that
 * introduces it, which is the one moment the person who wrote it is reading.
 *
 * ── WHY 400 DAYS ──────────────────────────────────────────────────────────
 * Long enough that any plausible test fixture has expired — nobody pins a
 * date thirteen months out by accident. Short enough that the skew stays
 * near real arithmetic: leap years, DST boundaries and weekday maths still
 * behave like the dates a person would reason about, rather than drifting
 * into a region where an unrelated failure is hard to tell from a real one.
 *
 * Because CI runs on every push, the horizon rolls: a literal two years out
 * is not caught today, but is caught the moment it comes within 400 days —
 * still about thirteen months before it could turn anything red.
 *
 * ── WHAT IT DOES NOT CATCH, DELIBERATELY ──────────────────────────────────
 * The right way to test a date rule is a FIXED `today` passed explicitly, as
 * tests/turnaround and tests/rush both do (`const MONDAY = "2026-08-31"`).
 * Those tests must keep their literals: `addBusinessDays(MONDAY, 1)` is
 * asserting something about a Monday, and a derived date would assert
 * nothing. Pushing the wall clock cannot disturb them, because they never
 * read it — which is exactly the property that makes them correct.
 *
 * Dates that are inert payload data (a string in an email body, a field in a
 * Printavo payload) are likewise untouched. Only a fixture whose validity
 * depends on the real present is caught, which is the only kind that rots.
 *
 * ── AND IT VERIFIES ITSELF ────────────────────────────────────────────────
 * A broken shim is worse than no shim: the second suite run would pass
 * vacuously and guard nothing, while still reporting green. So this asserts
 * its own installation and exits non-zero if the clock did not actually
 * move.
 *
 * Usage: `npm run test:future`, or NODE_OPTIONS='--import
 * ./tests/helpers/future-clock.mjs' in front of any node command.
 */
const RealDate = Date;

const DEFAULT_SKEW_DAYS = 400;
const skewDays = Number(process.env.CLOCK_SKEW_DAYS ?? DEFAULT_SKEW_DAYS);

if (!Number.isFinite(skewDays) || skewDays < 0) {
  console.error(
    `future-clock: CLOCK_SKEW_DAYS must be a non-negative number, got ${JSON.stringify(
      process.env.CLOCK_SKEW_DAYS
    )}`
  );
  process.exit(1);
}

const OFFSET_MS = skewDays * 24 * 60 * 60 * 1000;

/**
 * A `Date` that is the real one in every respect except that asking it for
 * *now* answers later. Every other construction — from a string, a number,
 * component parts — passes straight through, so a fixture that names an
 * explicit date still means that date.
 */
const FakeDate = function (...args) {
  // `Date(...)` called without `new` returns a string, not an instance.
  if (!new.target) return RealDate();

  if (args.length === 0) return new RealDate(RealDate.now() + OFFSET_MS);

  return new RealDate(...args);
};

// Sharing the prototype keeps `instanceof`, every instance method, and any
// library that subclasses or sniffs Date working unchanged.
FakeDate.prototype = RealDate.prototype;

for (const name of Reflect.ownKeys(RealDate)) {
  if (name === "prototype" || name === "length" || name === "name") continue;
  const descriptor = Reflect.getOwnPropertyDescriptor(RealDate, name);
  if (descriptor) Reflect.defineProperty(FakeDate, name, descriptor);
}

FakeDate.now = () => RealDate.now() + OFFSET_MS;

globalThis.Date = FakeDate;

// ── The self-check ────────────────────────────────────────────────────────
// Three ways this could silently become a no-op: the assignment is refused,
// a later import restores the real Date, or the offset computes to zero.
// All three look identical to a passing run from the outside.
{
  const skewedNow = new Date().getTime();
  const realNow = RealDate.now();
  const moved = skewedNow - realNow;
  const tolerance = 60 * 1000;

  if (Math.abs(moved - OFFSET_MS) > tolerance) {
    console.error(
      `future-clock: the clock did not move. Expected about ${OFFSET_MS}ms of skew, measured ${moved}ms. ` +
        "The suite would have passed without testing anything, so this is a failure rather than a warning."
    );
    process.exit(1);
  }

  if (skewDays > 0 && moved <= 0) {
    console.error("future-clock: skew is configured but the clock went backwards or stood still.");
    process.exit(1);
  }
}
