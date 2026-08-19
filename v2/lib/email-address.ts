/**
 * Does this look like an address that could receive mail?
 *
 * ── WHY IT LIVES ALONE ────────────────────────────────────────────────────
 * This rule is needed on both sides: lib/validation.ts runs it in the browser
 * before submit, and lib/email.ts runs it again before handing an address to
 * a mail provider. Keeping it in lib/email.ts meant the form could not use it
 * without pulling a thousand lines of mail-sending machinery into the client
 * bundle, so the form used `.trim()` instead — see the note in validation.ts
 * for what that let through.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 * It does not implement RFC 5322, and it must not try to. The only question
 * worth asking here is "could this plausibly be delivered", because the cost
 * of a false negative is a real customer told their real address is wrong.
 * So: one @, no whitespace, and a dot in the domain.
 *
 * `a@b` is rejected on purpose — a TLD-less address is not reachable from
 * outside the network it lives on, and no customer of this shop has one.
 *
 * A typo that passes a looser check is not rare, and this shop has already
 * paid for one: LEAD_TO_EMAIL was once set to an address with TWO "@" signs,
 * which every provider rejects and which nothing here noticed, because a
 * non-empty string was being treated as a working address.
 */
export function looksLikeEmailAddress(value: unknown) {
  const address = String(value ?? "").trim();
  return /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(address);
}
