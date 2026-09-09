/**
 * ONE LINE PER SUBMISSION, SO THE APP CAN BE ASKED QUESTIONS.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 * Every usage report this project has produced was reconstructed by reading
 * the shop's inbox. Nobody can say how many people reached an estimate, how
 * often the "not listed here" door is taken instead of the priced one, how
 * often artwork falls back to the email path, or how often a customer's
 * need-by date lands exactly on the floor the app would not let them go
 * under. Those are the four questions the last three weeks of work kept
 * running into, and none of them can be answered from the inbox.
 *
 * The route already logs plenty — a whole quote record, and a sentence for
 * every refusal. What it has never had is ONE grep-able line per
 * submission with the same fields in the same order, which is the
 * difference between "I remember seeing a few" and a count.
 *
 * ── EVERY SUBMISSION, INCLUDING THE ONES THAT FAILED ──────────────────────
 * The first draft emitted this beside the success response, and driving two
 * real quotes through a local server produced NO lines at all: with neither
 * email nor Printavo configured the route returns 502 UNDELIVERED and never
 * reaches the end. That is the exact submission most worth counting, so the
 * line is emitted before that gate and carries `delivered=` instead. "One
 * line per submission" has to mean the failures too, or the denominator is
 * wrong in the direction that flatters the app.
 *
 * ── NO PII, DELIBERATELY ─────────────────────────────────────────────────
 * No name, no email, no filename, no notes. The quote number is here
 * because it is the key to the Printavo record that legitimately holds all
 * of that; everything else is a shape, a count or a flag. A log line that
 * carries a customer's address is a log line that cannot be pasted into a
 * chat, and one that cannot be pasted does not get used.
 *
 * ── "AT THE FLOOR" IS A PROXY, AND SAYS SO ───────────────────────────────
 * The honest version of "did the app move their date?" would compare what
 * the customer ASKED for against what the picker allowed. The picker's
 * `min` means they cannot express the earlier date at all — Stuart Hinton
 * typed 18 Sep twice in a free-text box because the calendar would not take
 * it, and the record recorded the floor, 21 Sep, as his firm deadline.
 *
 * Until there is a field for the date they wanted, `atFloor` is what can be
 * counted: the customer picked exactly the earliest date the app allows. It
 * is not proof they wanted sooner. It IS the number that says how often the
 * question is worth asking — if half of all orders sit on the floor, the
 * floor is writing the answers.
 */

export type SubmissionFacts = {
  quoteNumber: string;
  /** stickers | signs | banners | apparel */
  flow: string;
  /**
   * Which door the customer walked through: the configurator that prices,
   * or the "my thing isn't listed" escape that does not.
   */
  door: "priced" | "special";
  /** Pieces, designs or garments — whatever this flow counts. */
  quantity: number;
  /** The server's own figure, never the browser's. */
  total: number;
  /** What they picked. */
  needBy: string;
  /** The earliest the app would have allowed. */
  earliest: string;
  /** How the artwork travelled. */
  artwork: "blob" | "form" | "dropped" | "none";
  /**
   * Did it reach the shop at all — email OR Printavo?
   *
   * False is the 502 the customer sees, and it is the single most important
   * line this log can carry: an order that reached nobody. It is a field
   * rather than a second log line because a submission that failed is still
   * a submission, and `grep QUOTE_SUBMITTED | wc -l` has to be the count of
   * people who pressed the button, not the count of people it worked for.
   */
  delivered: boolean;
  /** True when a payment link was raised. */
  billed: boolean;
  /** Half now, the balance before it leaves the shop. */
  deposit: boolean;
  /** Why not, when it did not bill. Trimmed — it is a log, not an essay. */
  reason?: string;
  /** Taken on the shop's own terminal. */
  kiosk: boolean;
};

/** Quotes a value only when it would otherwise break a field=value scan. */
function field(name: string, value: string | number | boolean): string {
  const text = String(value);

  return /[\s"]/.test(text)
    ? `${name}="${text.replace(/"/g, "'")}"`
    : `${name}=${text}`;
}

/**
 * The line. One per submission, fields always present and always in this
 * order, so `grep QUOTE_SUBMITTED | grep door=special | wc -l` is a real
 * answer rather than a research project.
 *
 * The prefix is one token with no spaces on purpose: it is what a filter in
 * the Vercel log viewer is set to.
 */
export function describeSubmission(facts: SubmissionFacts): string {
  const parts = [
    "QUOTE_SUBMITTED",
    field("quote", facts.quoteNumber),
    field("flow", facts.flow),
    field("door", facts.door),
    field("qty", Math.max(0, Math.round(facts.quantity))),
    field("total", facts.total.toFixed(2)),
    field("needBy", facts.needBy || "none"),
    field("earliest", facts.earliest || "none"),
    // See the header: a proxy for "the app shaped their answer", not proof.
    field("atFloor", Boolean(facts.needBy) && facts.needBy === facts.earliest),
    field("artwork", facts.artwork),
    field("delivered", facts.delivered),
    field("billed", facts.billed),
    field("deposit", facts.deposit),
    field("kiosk", facts.kiosk),
  ];

  // Only when it did not bill — on an ordinary order the reason is "it
  // billed", and repeating that on every line is what makes a log unread.
  if (!facts.billed && facts.reason) {
    parts.push(field("why", facts.reason.slice(0, 120)));
  }

  return parts.join(" ");
}
