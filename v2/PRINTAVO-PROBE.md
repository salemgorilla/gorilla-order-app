# Printavo probe — can we list one contact's orders in one query?

**Status: NOT RUN. Blocked on credentials, not on effort.**

Everything in Phases 2 and 3 of the repeat-customer spec assumes the answer is
yes. Nobody has checked. This file is the probe, ready to paste, so whoever has
a Printavo login can answer it in about five minutes.

## Why it is not answered here

This coding environment has no `PRINTAVO_EMAIL` / `PRINTAVO_TOKEN`, and the app
exposes no endpoint that runs arbitrary GraphQL — `/api/printavo-test` runs one
fixed query and `/api/order-status` runs another. There is no route from here to
the live account, and adding one would mean shipping an arbitrary-GraphQL
endpoint to production to answer a research question. That trade is not worth
making.

**Do not let a later session "solve" this by adding storage instead.** The
handoff is explicit: if a contact's orders are not retrievable in one query,
that is a real finding and the decision goes back to Gabe.

## Check these FOUR things in the Printavo UI first — they may make most of this unnecessary

**2026-08-19. Added after Gabe pointed out Printavo has a QR on each invoice.**
Chasing that turned up three more native features that overlap what we were
about to build. **None of this is verified** — Printavo's support site and
changelog are both blocked by this sandbox's egress proxy, so what follows is
from search-result summaries, not pages anybody here has read. Treat every line
as "worth two minutes in the UI", not as fact.

Each is faster to check than to build around.

### 1. The Customer Public Profile — this may BE `/my-orders`

Reportedly: `Customers > (the customer) > Public Profile` gives a shareable URL
where **that customer sees all their quotes and invoices and where each order
is in the workflow.**

That is Phase 2 of `GORILLA-SPEC-repeat-customer.md`, already built by the
vendor. If it holds up:

- Phase 2 does not need building. Link to it instead.
- **It stops the contact-orders question below from gating anything**, because
  Printavo does the listing. That probe would then matter only for Phase 3's
  reorder.

There is also said to be a shortcode `[customer-public-profile-url]` that drops
the link into Printavo's own invoice emails — which would give every customer
their order list without us sending anything at all.

**Open one for a real customer with two or more orders.** Does it show enough?
Is it presentable? That is the whole decision.

### 2. The privacy setting on invoices and profiles

Reportedly, with it enabled, an emailed or texted link works for **3 days**,
after which the viewer must enter the email address on the order.

That is the same shape as the magic link the spec proposes building — a
short-lived link, otherwise prove the address. If Printavo already does it, the
HMAC token and `ORDER_ACCESS_SECRET` in Phase 2 are work we do not need.

**Find out whether it is ON for account 23070.** It decides whether a public
invoice link is safe to hand a customer at the counter. We do not know today,
which is why the kiosk screen does not show one.

### 3. The QR on each invoice — we probably do not need to borrow it

Reportedly it opens the invoice, falling back to the Public Invoice View when
the scanner is not logged in. If so it is a QR **of a URL we already have**:
`quoteCreate` returns `publicUrl`, and we store it on every quote — kiosk
orders included, where we currently throw it away.

So there is nothing to fetch from the API. `qrcode` is already a dependency and
`KioskPickupCard` already renders one. Pointing a second QR at `publicUrl` is a
few lines, gated only on question 2.

### 4. Can a payment request go by SMS instead of email?

Reportedly Printavo can send a payment request by text. Our
`paymentRequestCreate` call takes an `email { to, subject, body }` block and
nobody has looked for an SMS equivalent.

This matters at the counter. Today a kiosk order deliberately generates NO
payment request, because creating one necessarily emails a live payable link to
an address a member of staff typed by ear — see `lib/kiosk.ts`. **If the API
can deliver by SMS to a phone number the customer reads back, that objection
goes away** and the kiosk can take payment the way the website does.

Ask the schema — one request:

```graphql
query { __type(name: "PaymentRequestCreateInput") { inputFields { name type { name kind } } } }
```

Report the field list.

---

## Also worth 60 seconds in the UI: the account's default tax rate

**Settings, wherever Printavo keeps sales tax.** Write down whether a default
rate is configured on the account, and what it is.

This is not idle curiosity. `buildPrintavoQuotePlan` sends `salesTax: 6.25` on
stickers and signs and **omits the field entirely on apparel**, because
Massachusetts exempts clothing. What Printavo does with an absent field is
unverified:

- **If there is no account default**, apparel invoices tax-free and the app
  and the invoice agree. Nothing to do.
- **If there IS an account default**, Printavo may apply it to every apparel
  quote — so the app tells the customer clothing is exempt and the invoice
  charges them 6.25% anyway. On a 24-shirt order that is real money and it is
  the shop's error, not the customer's.

The sticker path was reconciled to the cent on 15 Aug, so the rate we send is
demonstrably right when we send one. Nobody has ever reconciled an apparel
invoice, because apparel ships as a hand-quote request.

**Do not "fix" this speculatively.** Sending an explicit `salesTax: 0` would
close the hole if Printavo accepts it and break apparel quote creation if it
does not, and that cannot be tested from the build environment. Read the
setting first; the fix follows from the answer.

---

## Before you run anything

**The rate limit is 10 requests per 5 seconds, account-wide, and one submitted
quote costs 3.** A loop here can take live checkout down. Run these one at a
time, by hand, and wait a couple of seconds between them. There are four.

Use Printavo's GraphQL explorer if the account has one; otherwise curl with the
same headers `printavoRequest` uses (`email` + `token`).

## Probe 1 — does a contact expose its orders?

```graphql
query ContactOrders($q: String!) {
  contacts(query: $q, first: 5) {
    nodes {
      id
      email
      fullName
      orders(first: 25) {
        nodes {
          ... on Quote   { id visualId nickname createdAt status { name } }
          ... on Invoice { id visualId nickname createdAt status { name } }
        }
      }
    }
  }
}
```

Variables: `{ "q": "<a real customer email with 2+ orders>" }`

**If this works, stop — that is the answer.** Report whether each node carried
`nickname`, `status { name }` and a date, and whether `orders` was paginated.

## Probe 2 — if `contacts` has no `orders` field

Printavo will name the missing field in the error. Ask the schema what a
contact actually has:

```graphql
query { __type(name: "Contact") { fields { name type { name kind } } } }
```

Report the field list. If there is an orders-shaped connection under another
name, re-run probe 1 with it.

## Probe 3 — can `orders(query:)` filter by contact rather than fuzzy text?

```graphql
query OrdersByContact($q: String!) {
  orders(query: $q, first: 25) {
    nodes {
      ... on Quote   { id visualId nickname createdAt contact { id email } }
      ... on Invoice { id visualId nickname createdAt contact { id email } }
    }
  }
}
```

Run it twice, a couple of seconds apart: once with the customer's **email**,
once with their **contact id** from probe 1.

The thing to watch for is not whether it returns rows — it is whether every row
belongs to that contact. `lookupOrderStatus` already treats this search as
fuzzy and re-checks the nickname afterwards for exactly that reason. If the
email search returns other people's orders, say so plainly; a `/my-orders` page
built on a fuzzy match would show one customer another customer's work.

## Probe 4 — what happens at volume

Ask for a page size larger than any real customer's history:

```graphql
query { orders(query: "<email>", first: 100) { nodes { ... on Quote { id } } } }
```

Report: does it accept `first: 100`? Is there a `pageInfo { hasNextPage }`? What
is the maximum page size it will take?

## What to write down

1. Which probe worked, if any.
2. For its nodes: `nickname` present? `status { name }` present? a date present?
3. Paginated — and what happens to a contact with 200 orders.
4. **Whether every returned order genuinely belongs to that contact**, or
   whether the search returns whatever it thinks is close.
5. Whether any of it needs more than ONE request. A query per order is not an
   option, so a shape that needs one is not viable and should be reported as a
   no.

## If the answer is no

Say so and stop. Phases 2 and 3 then need a database, and that is Gabe's call,
not a thing to route around.

## Worth knowing before you trust the docs

Printavo's published schema has already been wrong for this integration once:
`lineItems` is documented as a nested list and is flat live — see the note in
`createPrintavoQuote`. A contact-orders shape that reads correctly in the docs
is not evidence. Run it.
